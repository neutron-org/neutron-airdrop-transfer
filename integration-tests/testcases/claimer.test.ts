import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { SigningCosmWasmClient } from '@cosmjs/cosmwasm-stargate';
import {coin, DirectSecp256k1HdWallet} from '@cosmjs/proto-signing';
import { GasPrice } from '@cosmjs/stargate';
import { setupPark } from '../src/testSuite';
import fs from 'fs';
import Cosmopark from '@neutron-org/cosmopark';
import {Client as NeutronClient} from "@neutron-org/client-ts";
import {V1IdentifiedChannel} from "@neutron-org/client-ts/src/ibc.core.channel.v1/rest";
import {getIBCDenom} from "../src/helpers/ibc_denom";
import {sleep, waitFor, waitForResult} from "../src/helpers/sleep";
import {GaiaClient} from "../src/helpers/gaia_client";
import {ModuleAccount} from "@neutron-org/client-ts/src/cosmos.auth.v1beta1/types/cosmos/auth/v1beta1/auth";

describe('Test claim artifact', () => {
    const context: { park?: Cosmopark } = {}

    let client: SigningCosmWasmClient
    let neutronClient: any
    let hubClient: any
    let deployer: string

    beforeAll(async () => {
        context.park = await setupPark('simple', ['neutron', 'gaia'], true)

        const mnemonic = context.park.config.wallets.demowallet1.mnemonic
        const endpoint = `http://127.0.0.1:${context.park.ports['neutron'].rpc}`
        const options = {gasPrice: GasPrice.fromString('0.025untrn')}
        const walletOptions = {prefix: 'neutron'}
        const wallet = await DirectSecp256k1HdWallet.fromMnemonic(mnemonic, walletOptions)
        client = await SigningCosmWasmClient.connectWithSigner(endpoint, wallet, options)

        // deployer will deploy and manage all of our contracts for simplicity
        const accounts = await wallet.getAccounts()
        deployer = accounts[0].address;

        const neutronCl = new NeutronClient({
            apiURL: `http://127.0.0.1:${context.park.ports['neutron'].rest}`,
            rpcURL: `127.0.0.1:${context.park.ports['neutron'].rpc}`,
            prefix: 'neutron',
        })
        const hubCl = new GaiaClient({
            apiURL: `http://127.0.0.1:${context.park.ports['gaia'].rest}`,
            rpcURL: `127.0.0.1:${context.park.ports['gaia'].rpc}`,
            prefix: 'cosmos'
        })


        neutronClient = neutronCl
        hubClient = hubCl
    }, 1000000)

    afterAll(async () => {
        if (!!context.park) {
            console.log('Stopping cosmopark...')
            await context.park.stop();
        }
    })

    let claimerCodeId: number

    let creditsAddress: string
    let airdropAddress: string
    let claimerAddress: string

    // untrn sent over transfer channel to gaia
    let ibcDenom: string;

    let transferChannel: V1IdentifiedChannel;

    it('already has transfer channel', async () => {
        const res = await neutronClient.IbcCoreChannelV1.query.queryChannels();
        transferChannel = res.data.channels.find(c => c.port_id === 'transfer' && c.state === 'STATE_OPEN')
        expect(transferChannel).toBeDefined()
        expect(transferChannel.port_id).toEqual('transfer')
    })

    it('deploys the contracts - airdrop, credits and claimer', async () => {
        let connectionId = transferChannel.connection_hops[0];
        ibcDenom = getIBCDenom('transfer', transferChannel.counterparty.channel_id, 'untrn');

        const {codeId: creditsCodeId} = await client.upload(
            deployer,
            fs.readFileSync('./artifacts/credits.wasm'),
            1.5,
        )
        expect(creditsCodeId).toBeGreaterThan(0)
        const creditsres = await client.instantiate(deployer, creditsCodeId, {
            dao_address: deployer,
        }, 'credits', 'auto')
        creditsAddress = creditsres.contractAddress
        expect(creditsAddress).toBeTruthy()

        const {codeId: airdropCodeId} = await client.upload(
            deployer,
            fs.readFileSync('./artifacts/cw20_merkle_airdrop.wasm'),
            1.5,
        )
        expect(airdropCodeId).toBeGreaterThan(0)
        const airdropres = await client.instantiate(deployer, airdropCodeId, {
            credits_address: creditsAddress,
            reserve_address: deployer, // incorrect address, (set to main dao in prod), migrated here below
            merkle_root: '59d0f23be7d1bc58059decf25e01fdd7e2fd63df79957f59976f995160a44022', // random sha256 hash
            airdrop_start: 0,
            vesting_start: 1,
            vesting_duration_seconds: 1,
            total_amount: null,
            hrp: null
        }, 'airdrop', 'auto', {
            admin: deployer, // want to be able to migrate contract to set reserve_address later for testing purposes
        })
        airdropAddress = airdropres.contractAddress
        expect(airdropAddress).toBeTruthy()

        await client.execute(deployer, creditsAddress, {
            update_config: {
                config: {
                    airdrop_address: airdropAddress,
                    when_withdrawable: 0,
                    lockdrop_address: airdropAddress, // does not matter
                },
            },
        }, 'auto')

        const claimerStoreRes = await client.upload(
            deployer,
            fs.readFileSync('../artifacts/neutron_airdrop_transfer.wasm'),
            1.5,
        )
        claimerCodeId = claimerStoreRes.codeId;
        expect(claimerCodeId).toBeGreaterThan(0)

        const claimerres = await client.instantiate(deployer, claimerCodeId, {
            connection_id: connectionId,
            airdrop_address: airdropAddress, // incorrect address, migrated below
            channel_id_to_hub: transferChannel.channel_id, // neutron to cosmoshub transfer channel id
            ibc_neutron_denom: ibcDenom,
            transfer_timeout_height: {
                revision_number: 1,
                revision_height: 5000,
            },
            ica_timeout_seconds: 5000,
        }, 'credits', 'auto', {
            admin: deployer // want to be able to migrate contract for testing purposes (set low timeout values)
        });
        claimerAddress = claimerres.contractAddress;
        expect(claimerAddress).toBeTruthy()

        await client.migrate(deployer, airdropAddress, airdropCodeId, {
            reserve_address: claimerAddress,
        }, 'auto')
    }, 1000000);

    it('mints money for airdrop in credits contract', async () => {
        // send money to credits
        await client.execute(deployer, creditsAddress, {
            mint: {}
        }, 'auto', 'mint in credits', [coin(9000, "untrn")])

        const balance = await client.getBalance(creditsAddress, 'untrn')
        expect(balance.amount).toEqual('9000');
    }, 1000000)

    it.skip('does not run send claimed steps before creating ICA account', async () => {

    })

    it('creates ICA account', async () => {
        await client.execute(deployer, claimerAddress, {
            create_hub_i_c_a: {},
        }, 'auto', '', [])

        await waitFor(async () => {
            const ica = await client.queryContractSmart(claimerAddress, { interchain_account: {} })
            return !!(ica && ica.address);
        }, 60000)

        // it does not change stage
        const stage = await client.queryContractSmart(claimerAddress, { stage: {} })
        expect(stage).toEqual('claim_unclaimed')
    }, 1000000)

    it('step 1 - claiming money from airdrop -> credits -> airdrop -> reserve_address (claimerAddress)', async () => {
        await client.execute(deployer, claimerAddress, {
            "claim_unclaimed": {},
        }, 'auto', 'mint in credits', [])

        const balance = await client.getBalance(claimerAddress, 'untrn')
        expect(balance.amount).toEqual('9000')

        const creditsBalance = await client.getBalance(creditsAddress, 'untrn')
        expect(creditsBalance.amount).toEqual('0')
    }, 1000000)

    it('step 2 with timeout - send claimed tokens to ICA account', async () => {
        const hubBlock = await hubClient.CosmosBaseTendermintV1Beta1.query.serviceGetLatestBlock()

        // migrate timeout to small value
        await client.migrate(deployer, claimerAddress, claimerCodeId, {
            transfer_timeout_height: {
                revision_number: 1,
                revision_height: (+hubBlock.data.block.header.height) + 1,
            },
        }, 'auto')

        await sleep(1000);

        await client.execute(deployer, claimerAddress, {
            send_claimed_tokens_to_i_c_a: {},
        }, 'auto', '', [{amount: '5000', denom: 'untrn'}])

        // wait until interchain tx is not in progress
        await waitFor(async () => {
            const inProgress = await client.queryContractSmart(claimerAddress, { interchain_tx_in_progress: {} })
            console.log('iN progress: ' + inProgress);
            return !inProgress
        }, 500000)

        // expect stage to be the old one
        const stage = await client.queryContractSmart(claimerAddress, { stage: {} })
        console.log('stage should be sendClaimedTokensTOICA: ' + JSON.stringify(stage))
        expect(stage).toEqual('send_claimed_tokens_to_i_c_a')

        // // expect ica to be still present since timeout in IBC does not close ICA
        // const ica = await client.queryContractSmart(claimerAddress, { interchain_account: {} })
        // expect(ica).toBeTruthy()
        // expect(ica.address).toBeTruthy()

        // expect timeout callback to be called
        const callbackStates = await client.queryContractSmart(claimerAddress, { ibc_callback_states: {} })
        expect(callbackStates).toBeDefined()
        expect(callbackStates.length).toEqual(1)
        console.log('timeout: ' + JSON.stringify(callbackStates[0]))
        expect(callbackStates[0].timeout[0].source_port).toEqual('transfer');

        // return back old values
        await client.migrate(deployer, claimerAddress, claimerCodeId, {
            transfer_timeout_height: {
                revision_number: 1,
                revision_height: 5000
            }
        }, 'auto')
    }, 1000000)

    it('step 2 - send claimed tokens to ICA account', async () => {
        console.log('before sending')
        await client.execute(deployer, claimerAddress, {
            send_claimed_tokens_to_i_c_a: {},
        }, 'auto', '', [{amount: '5000', denom: 'untrn'}])
        console.log('after sending')

        // wait until interchain tx is not in progress
        await waitFor(async () => {
            const inProgress = await client.queryContractSmart(claimerAddress, { interchain_tx_in_progress: {} })
            return !inProgress
        }, 500000)

        // balance on contract should be 0 + 2500 refunded timeout fee
        const balanceAfter = await client.getBalance(claimerAddress, 'untrn')
        expect(balanceAfter.amount).toEqual('2500');

        // wait for balance to be present on hub ica
        const ica = await client.queryContractSmart(claimerAddress, { interchain_account: {} })
        console.log('before querying balance: ' + ica.address)
        const icaBalance = await hubClient.CosmosBankV1Beta1.query.queryBalance(ica.address, { denom: ibcDenom })
        console.log('after querying balance')
        // 9000 initially + refunded 2500 from ack fee in step 2 = 11500
        expect(icaBalance.data.balance.amount).toEqual('11500')

        // expect stage to change
        const stage = await client.queryContractSmart(claimerAddress, { stage: {} })
        expect(stage).toEqual('fund_community_pool')

        // check callbacks
        const callbackStates = await client.queryContractSmart(claimerAddress, { ibc_callback_states: {} })
        expect(callbackStates.length).toEqual(2)
        expect(callbackStates[1].response[0].source_port).toEqual('transfer')

        const transferAmount = await client.queryContractSmart(claimerAddress, { transfer_amount: {} })
        expect(transferAmount).toEqual('11500')
    }, 1000000)

    it('step 3 with timeout - fund community pool', async () => {
        // migrate to small timeout
        await client.migrate(deployer, claimerAddress, claimerCodeId, {
            ica_timeout_seconds: 1,
        }, 'auto')

        // ica is present before the call
        const ica = await client.queryContractSmart(claimerAddress, { interchain_account: {} })
        expect(ica).toBeTruthy()

        await client.execute(deployer, claimerAddress, {
            fund_community_pool: {},
        }, 'auto', 'fund community pool', [{ amount: '8000', denom: 'untrn' }])

        // wait until interchain tx is not in progress
        await waitFor(async () => {
            const inProgress = await client.queryContractSmart(claimerAddress, { interchain_tx_in_progress: {} })
            return !inProgress
        }, 500000)

        // stage does not change
        const stage = await client.queryContractSmart(claimerAddress, { stage: {} })
        expect(stage).toEqual('fund_community_pool')

        // check new callback
        const callbackStates = await client.queryContractSmart(claimerAddress, { ibc_callback_states: {} })
        expect(callbackStates.length).toEqual(3)
        expect(callbackStates[2].timeout[0].sequence).toEqual(1)
        console.log('response: ' + JSON.stringify(callbackStates[2].timeout))
        expect(callbackStates[2].timeout[0].source_port).toEqual(ica.source_port_id);

        // ICA is removed
        const icaAfter = await client.queryContractSmart(claimerAddress, { interchain_account: {} })
        expect(icaAfter).toEqual(null)

        // migrate to old value
        await client.migrate(deployer, claimerAddress, claimerCodeId, {
            ica_timeout_seconds: 5000,
        }, 'auto')
    })

    it('recreates ICA after timeout', async () => {
        await client.execute(deployer, claimerAddress, {
            create_hub_i_c_a: {},
        }, 'auto', '', [])

        await waitFor(async () => {
            const ica = await client.queryContractSmart(claimerAddress, { interchain_account: {} })
            return !!(ica && ica.address);
        }, 60000)

        // it does not change stage
        const stage = await client.queryContractSmart(claimerAddress, { stage: {} })
        expect(stage).toEqual('fund_community_pool')
    })

    it.skip('step 3 with error - fund community pool', async () => {
        // TODO: change transfer amount to bigger value (15000)

        // TODO: execute fund community pool

        // wait until interchain tx is not in progress
        await waitFor(async () => {
            const inProgress = await client.queryContractSmart(claimerAddress, { interchain_tx_in_progress: {} })
            return !inProgress
        }, 500000)

        // TODO: should not close ICA

        // TODO: should not change stage
    })

    it('step 3 - fund community pool', async () => {
        await client.execute(deployer, claimerAddress, {
            fund_community_pool: {},
        }, 'auto', 'fund community pool', [{ amount: '8000', denom: 'untrn' }])

        // wait until interchain tx is not in progress
        await waitFor(async () => {
            const inProgress = await client.queryContractSmart(claimerAddress, { interchain_tx_in_progress: {} })
            return !inProgress
        }, 500000)

        // await stage to be 'done'
        const stage = await client.queryContractSmart(claimerAddress, { stage: {} })
        expect(stage).toEqual('done')

        // expect balance to be 0 on ICA
        const ica = await client.queryContractSmart(claimerAddress, { interchain_account: {} })
        const icaBalance = await hubClient.CosmosBankV1Beta1.query.queryBalance(ica.address, { denom: ibcDenom })
        console.log('after querying balance')
        // 9000 initially + refunded 2500 from ack fee in step 2 = 11500
        expect(icaBalance.data.balance.amount).toEqual('0')

        // TODO: check that community pool account is funded
        const moduleAccountResponse = await hubClient.CosmosAuthV1Beta1.query.queryModuleAccountByName('distribution')
        const moduleAccount = ModuleAccount.fromJSON(moduleAccountResponse.data.account).baseAccount.address
        const icaBalanceInPool = await hubClient.CosmosBankV1Beta1.query.queryBalance(moduleAccount, { denom: ibcDenom })
        expect(icaBalanceInPool.data.balance.amount).toEqual('11500')
    }, 1000000)
})

// TODO: checks that calling stage ahead of time does not work

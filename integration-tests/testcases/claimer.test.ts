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
import {sleep, waitFor} from "../src/helpers/sleep";
import {GaiaClient} from "../src/helpers/gaia_client";

describe('Test claim artifact', () => {
    const context: { park?: Cosmopark } = {}

    let client: SigningCosmWasmClient
    let neutronClient: any
    let hubClient: any
    let deployer: string

    let claimerCodeId: number

    let creditsAddress: string
    let airdropAddress: string
    let claimerAddress: string

    // untrn sent over transfer channel to gaia
    let ibcDenom: string;

    let transferChannel: V1IdentifiedChannel;

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

        neutronClient = new NeutronClient({
            apiURL: `http://127.0.0.1:${context.park.ports['neutron'].rest}`,
            rpcURL: `127.0.0.1:${context.park.ports['neutron'].rpc}`,
            prefix: 'neutron',
        })
        hubClient = new GaiaClient({
            apiURL: `http://127.0.0.1:${context.park.ports['gaia'].rest}`,
            rpcURL: `127.0.0.1:${context.park.ports['gaia'].rpc}`,
            prefix: 'cosmos'
        })
    }, 1000000)

    afterAll(async () => {
        if (context.park) {
            await context.park.stop();
        }
    })

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
        const creditsRes = await client.instantiate(deployer, creditsCodeId, {
            dao_address: deployer,
        }, 'credits', 'auto')
        creditsAddress = creditsRes.contractAddress
        expect(creditsAddress).toBeTruthy()

        const {codeId: airdropCodeId} = await client.upload(
            deployer,
            fs.readFileSync('./artifacts/cw20_merkle_airdrop.wasm'),
            1.5,
        )
        expect(airdropCodeId).toBeGreaterThan(0)
        const airdropRes = await client.instantiate(deployer, airdropCodeId, {
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
        airdropAddress = airdropRes.contractAddress
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

        const claimerRes = await client.instantiate(deployer, claimerCodeId, {
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
        claimerAddress = claimerRes.contractAddress;
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

    it('calling step 2 ahead of time does not work before step 1 is finished', async () => {
        await expect(() =>
            client.execute(deployer, claimerAddress, {
                send_claimed_tokens_to_i_c_a: {
                    timeout_height: {
                        revision_number: 1,
                        revision_height: 20000,
                    },
                },
            }, 'auto', '', [])
        ).rejects.toThrowError(/incorrect stage: ClaimUnclaimed/)
    })

    it('step 1 - claiming money from airdrop -> credits -> airdrop -> reserve_address (claimerAddress)', async () => {
        await client.execute(deployer, claimerAddress, {
            "claim_unclaimed": {},
        }, 'auto', 'mint in credits', [])

        const balance = await client.getBalance(claimerAddress, 'untrn')
        expect(balance.amount).toEqual('9000')

        const creditsBalance = await client.getBalance(creditsAddress, 'untrn')
        expect(creditsBalance.amount).toEqual('0')
    }, 1000000)

    it('calling step 3 ahead of time does not work before step 2 is finished', async () => {
        await expect(() =>
            client.execute(deployer, claimerAddress, {
                fund_community_pool: {},
            }, 'auto', '', [])
        ).rejects.toThrow(/incorrect stage: SendClaimedTokensToICA/)
    })

    it('does not run send claimed steps before creating ICA account', async () => {
        await expect(() =>
            client.execute(deployer, claimerAddress, {
                send_claimed_tokens_to_i_c_a: {
                    timeout_height: {
                        revision_number: 1,
                        revision_height: 20000,
                    },
                },
            }, 'auto', '', [])
        ).rejects.toThrowError(/ica is not created or open/)
    })

    it('creates ICA account', async () => {
        // pause hermes to test creating ica account two times almost simultaneously
        await context.park.relayers.find(r => r.type() === 'hermes').pause();

        console.log('create first ica account')
        const first = await client.execute(deployer, claimerAddress, {
            create_hub_i_c_a: {},
        }, 'auto', '', [])
        console.log('first executed: ' + JSON.stringify(first.logs), null, '\t')

        // second transaction should fail right away
        console.log('create second ica account')
        const second = await client.execute(deployer, claimerAddress, {
            create_hub_i_c_a: {},
        }, 'auto', '', [])
        console.log('second executed: ' + JSON.stringify(second.logs), null, '\t')

        console.log('unpaused relayer')
        // await context.park.relayers.find(r => r.type() === 'hermes').unpause();

        await waitFor(async () => {
            const ica = await client.queryContractSmart(claimerAddress, { interchain_account: {} })
            return !!(ica && ica.address);
        }, 60000)

        console.log('ica created')

        // it does not change stage
        const stage = await client.queryContractSmart(claimerAddress, { stage: {} })
        expect(stage).toEqual('send_claimed_tokens_to_i_c_a')
    }, 1000000)

    it('step 2 with timeout - send claimed tokens to ICA account', async () => {
        const callbackStatesLengthBefore = (await client.queryContractSmart(claimerAddress, { ibc_callback_states: {} })).length

        const hubBlock = await hubClient.CosmosBaseTendermintV1Beta1.query.serviceGetLatestBlock()
        await client.execute(deployer, claimerAddress, {
            send_claimed_tokens_to_i_c_a: {
                timeout_height: {
                    revision_number: 1,
                    revision_height: (+hubBlock.data.block.header.height) + 1,
                },
            },
        }, 'auto', '', [{amount: '5000', denom: 'untrn'}])

        // wait until interchain tx is not in progress
        await waitFor(async () => {
            const inProgress = await client.queryContractSmart(claimerAddress, { interchain_tx_in_progress: {} })
            return !inProgress
        }, 500000)

        // expect stage to be the old one
        const stage = await client.queryContractSmart(claimerAddress, { stage: {} })
        expect(stage).toEqual('send_claimed_tokens_to_i_c_a')

        // expect timeout callback to be called
        const callbackStates = await client.queryContractSmart(claimerAddress, { ibc_callback_states: {} })
        expect(callbackStates.length).toEqual(callbackStatesLengthBefore + 1)
        expect(callbackStates[callbackStates.length - 1].timeout[0].source_port).toEqual('transfer')

        // funds still on contract
        const balanceAfter = await client.getBalance(claimerAddress, 'untrn')
        expect(balanceAfter.amount).toEqual('11500');
    }, 1000000)

    it('step 2 with error - send claimed tokens to ICA account', async () => {
        const icaBefore = await client.queryContractSmart(claimerAddress, { interchain_account: {} })
        const callbackStatesLengthBefore = (await client.queryContractSmart(claimerAddress, { ibc_callback_states: {} })).length

        // expect to error when trying to send money to module account
        const moduleAccountResponse = await hubClient.CosmosAuthV1Beta1.query.queryModuleAccountByName('distribution')
        const moduleAccount = moduleAccountResponse.data.account.base_account.address
        await client.migrate(deployer, claimerAddress, claimerCodeId, {
            ica_address: moduleAccount,
        }, 'auto')

        // try to send funds to the module account
        const hubBlock = await hubClient.CosmosBaseTendermintV1Beta1.query.serviceGetLatestBlock()
        await client.execute(deployer, claimerAddress, {
            send_claimed_tokens_to_i_c_a: {
                timeout_height: {
                    revision_number: 1,
                    revision_height: (+hubBlock.data.block.header.height) + 1,
                },
            },
        }, 'auto', '', [{amount: '5000', denom: 'untrn'}])

        // wait until interchain tx is not in progress
        await waitFor(async () => {
            const inProgress = await client.queryContractSmart(claimerAddress, { interchain_tx_in_progress: {} })
            return !inProgress
        }, 500000)

        // check callbacks
        const callbackStates = await client.queryContractSmart(claimerAddress, { ibc_callback_states: {} })
        expect(callbackStates.length).toEqual(callbackStatesLengthBefore + 1)
        expect(callbackStates[callbackStates.length - 1].error[0].source_port).toEqual('transfer')
        expect(JSON.stringify(callbackStates[callbackStates.length - 1].error)).toMatch(/error handling packet/)

        // stage did not change
        const stage = await client.queryContractSmart(claimerAddress, { stage: {} })
        expect(stage).toEqual('send_claimed_tokens_to_i_c_a')

        // funds still on contract
        const balanceAfter = await client.getBalance(claimerAddress, 'untrn')
        expect(balanceAfter.amount).toEqual('14000');

        // get back value
        await client.migrate(deployer, claimerAddress, claimerCodeId, {
            ica_address: icaBefore.address,
        }, 'auto')
    })

    it('step 2 - send claimed tokens to ICA account', async () => {
        const callbackStatesLengthBefore = (await client.queryContractSmart(claimerAddress, { ibc_callback_states: {} })).length

        await client.execute(deployer, claimerAddress, {
            send_claimed_tokens_to_i_c_a: {
                timeout_height: {
                    revision_number: 1,
                    revision_height: 20000,
                },
            },
        }, 'auto', '', [{amount: '5000', denom: 'untrn'}])

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
        const icaBalance = await hubClient.CosmosBankV1Beta1.query.queryBalance(ica.address, { denom: ibcDenom })
        // 9000 initially + refunded 5000 from 2 acks fee in step 2 = 14000
        expect(icaBalance.data.balance.amount).toEqual('14000')

        // expect stage to change
        const stage = await client.queryContractSmart(claimerAddress, { stage: {} })
        expect(stage).toEqual('fund_community_pool')

        // check callbacks
        const callbackStates = await client.queryContractSmart(claimerAddress, { ibc_callback_states: {} })
        expect(callbackStates.length).toEqual(callbackStatesLengthBefore + 1)
        expect(callbackStates[callbackStates.length - 1].response[0].source_port).toEqual('transfer')

        const transferAmount = await client.queryContractSmart(claimerAddress, { transfer_amount: {} })
        expect(transferAmount).toEqual('14000')
    }, 1000000)

    it('step 3 with timeout - fund community pool', async () => {
        // migrate to small timeout
        await client.migrate(deployer, claimerAddress, claimerCodeId, {
            ica_timeout_seconds: 1,
        }, 'auto')

        // ica is present before the call
        const ica = await client.queryContractSmart(claimerAddress, { interchain_account: {} })
        expect(ica).toBeTruthy()

        const callbackStatesLengthBefore = (await client.queryContractSmart(claimerAddress, { ibc_callback_states: {} })).length

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
        expect(callbackStates.length).toEqual(callbackStatesLengthBefore + 1)
        expect(callbackStates[callbackStates.length - 1].timeout[0].sequence).toEqual(1)
        expect(callbackStates[callbackStates.length - 1].timeout[0].source_port).toEqual(ica.port_id);

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

    it('step 3 with error - fund community pool', async () => {
        // migrate to incorrect denom
        await client.migrate(deployer, claimerAddress, claimerCodeId, {
            ibc_neutron_denom: 'uatom',
        }, 'auto')

        const callbackStatesLengthBefore = (await client.queryContractSmart(claimerAddress, { ibc_callback_states: {} })).length

        // run step 3
        await client.execute(deployer, claimerAddress, {
            fund_community_pool: {},
        }, 'auto', '', [{ amount: '8000', denom: 'untrn' }])

        // wait until interchain tx is not in progress
        await waitFor(async () => {
            const inProgress = await client.queryContractSmart(claimerAddress, { interchain_tx_in_progress: {} })
            return !inProgress
        }, 500000)

        const ica = await client.queryContractSmart(claimerAddress, { interchain_account: {} })
        expect(ica).toBeTruthy()

        const stage = await client.queryContractSmart(claimerAddress, { stage: {} })
        expect(stage).toEqual('fund_community_pool')

        const callbackStates = await client.queryContractSmart(claimerAddress, { ibc_callback_states: {} })
        expect(callbackStates.length).toEqual(callbackStatesLengthBefore + 1)
        expect(callbackStates[callbackStates.length - 1].error[0].source_port).toEqual(ica.port_id)

        // migrate back denom to correct one
        await client.migrate(deployer, claimerAddress, claimerCodeId, {
            ibc_neutron_denom: ibcDenom,
        }, 'auto')
    })

    it('step 3 - fund community pool', async () => {
        const callbackStatesLengthBefore = (await client.queryContractSmart(claimerAddress, { ibc_callback_states: {} })).length

        await client.execute(deployer, claimerAddress, {
            fund_community_pool: {},
        }, 'auto', '', [{ amount: '8000', denom: 'untrn' }])

        // wait until interchain tx is not in progress
        await waitFor(async () => {
            const inProgress = await client.queryContractSmart(claimerAddress, { interchain_tx_in_progress: {} })
            return !inProgress
        }, 500000)

        // should return callback
        const ica = await client.queryContractSmart(claimerAddress, { interchain_account: {} })
        const callbackStates = await client.queryContractSmart(claimerAddress, { ibc_callback_states: {} })
        expect(callbackStates.length).toEqual(callbackStatesLengthBefore + 1)
        expect(callbackStates[callbackStates.length - 1].response[0].source_port).toEqual(ica.port_id)

        // stage should be 'done'
        const stage = await client.queryContractSmart(claimerAddress, { stage: {} })
        expect(stage).toEqual('done')

        // expect balance to be 0 on ICA after funding
        const icaBalance = await hubClient.CosmosBankV1Beta1.query.queryBalance(ica.address, { denom: ibcDenom })
        expect(icaBalance.data.balance.amount).toEqual('0')

        // expect community pool to have transferred funds
        const moduleAccountResponse = await hubClient.CosmosAuthV1Beta1.query.queryModuleAccountByName('distribution')
        const moduleAccount = moduleAccountResponse.data.account.base_account.address
        const icaBalanceInPool = await hubClient.CosmosBankV1Beta1.query.queryBalance(moduleAccount, { denom: ibcDenom })
        expect(icaBalanceInPool.data.balance.amount).toEqual('14000')
    }, 1000000)

    it('calling step 3 again does not work after step 3 is done', async () => {
        await expect(() =>
            client.execute(deployer, claimerAddress, {
                fund_community_pool: {},
            }, 'auto', '', [])
        ).rejects.toThrowError(/incorrect stage: Done/)
    })
})

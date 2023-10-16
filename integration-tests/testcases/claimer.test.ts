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
import {waitFor} from "../src/helpers/sleep";
import {GaiaClient} from "../src/helpers/gaia_client";

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

    const initialTimeout = 600;

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
            transfer_timeout_seconds: initialTimeout,
            ica_timeout_seconds: initialTimeout,
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
        }, 'auto', 'create hub ica', [])

        await waitFor(async () => {
            const ica = await client.queryContractSmart(claimerAddress, { interchain_account: {} })
            return !!(ica && ica.address);
        }, 60000)

        // it does not change stage
        const stage = await client.queryContractSmart(claimerAddress, { stage: {} })
        expect(stage).toEqual('ClaimUnclaimed')
    }, 1000000)

    it('Step 1 - claiming money from airdrop -> credits -> airdrop -> reserve_address (claimerAddress)', async () => {
        await client.execute(deployer, claimerAddress, {
            "claim_unclaimed": {},
        }, 'auto', 'mint in credits', [])

        const balance = await client.getBalance(claimerAddress, 'untrn')
        expect(balance.amount).toEqual(9000)

        const creditsBalance = await client.getBalance(creditsAddress, 'untrn')
        expect(creditsBalance.amount).toEqual(0)
    }, 1000000)

    it('Step 2 with timeout case', async () => {
        // migrate timeout to small value
        await client.migrate(deployer, claimerAddress, claimerCodeId, {
            transfer_timeout_seconds: 1,
            ica_timeout_seconds: 1,
        }, 'auto')

        await client.execute(deployer, claimerAddress, {
            send_claimed_tokens_to_i_c_a: {},
        }, 'auto', 'create hub ica', [{amount: '5000', denom: 'untrn'}])

        // wait until interchain tx is not in progress
        await waitFor(async () => {
            const inProgress = await client.queryContractSmart(claimerAddress, { interchain_tx_in_progress: {} })
            return !inProgress
        })

        // expect stage to be the old one
        const stage = await client.queryContractSmart(claimerAddress, { stage: {} })
        console.log('stage should be sendClaimedTokensTOICA: ' + JSON.stringify(stage));
        // expect(stage).toEqual('SendClaimedTokensToICA') // TODO: uncomment

        // expect ica to be still present since timeout in IBC does not close ICA
        const ica = await client.queryContractSmart(claimerAddress, { interchain_account: {} })
        expect(ica).toBeTruthy()
        expect(ica.address).toBeTruthy()

        await client.migrate(deployer, claimerAddress, claimerCodeId, {
            transfer_timeout_seconds: initialTimeout,
            ica_timeout_seconds: initialTimeout,
        }, 'auto')
    }, 1000000)

    it('Step 2 - send claimed tokens to ICA account', async () => {
        await client.execute(deployer, claimerAddress, {
            send_claimed_tokens_to_i_c_a: {},
        }, 'auto', 'create hub ica', [{amount: '5000', denom: 'untrn'}])
        const balanceAfter = await client.getBalance(claimerAddress, 'untrn')
        expect(balanceAfter).toEqual(0);

        await waitFor(async () => {
            const ica = await client.queryContractSmart(claimerAddress, { interchain_account: {} })
            const icaBalance = await hubClient.CosmosBankV1Beta1.query.queryBalance(ica.address, ibcDenom)

            if (!!icaBalance) {
                expect(icaBalance.amount).toEqual(9000);
                return true;
            }
            return false;
        })
    }, 1000000)

    it.skip('Step 3 - send claimed tokens to ICA account', async () => {
        await client.execute(deployer, claimerAddress, {
            fund_community_pool: {},
        }, 'auto', 'fund community pool', [{ amount: '8000', denom: 'untrn' }])

        // TODO: check that ICA account now at 0 funds
        // TODO: check that community pool account is funded
    }, 1000000)
})

class ClaimerClient {
    client: SigningCosmWasmClient;
    constructor(client: SigningCosmWasmClient) {
        this.client = client;
    }
}

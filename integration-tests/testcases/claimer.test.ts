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

describe('Test claim artifact', () => {
    const context: { park?: Cosmopark } = {}

    let client: SigningCosmWasmClient;
    let neutronClient: any
    let deployer: string

    beforeAll(async () => {
        context.park = await setupPark('simple', ['neutron', 'gaia'], true)

        const mnemonic = context.park.config.wallets.demowallet1.mnemonic
        const endpoint = `http://127.0.0.1:${context.park.ports['neutron'].rpc}`
        const options = {gasPrice: GasPrice.fromString('0.025untrn')}
        const walletOptions = {prefix: 'neutron'}
        const wallet = await DirectSecp256k1HdWallet.fromMnemonic(mnemonic, walletOptions)
        client = await SigningCosmWasmClient.connectWithSigner(endpoint, wallet, options)
        const accounts = await wallet.getAccounts()
        deployer = accounts[0].address;

        const rest = `127.0.0.1:${context.park.ports['neutron'].rest}`
        const rpc = `127.0.0.1:${context.park.ports['neutron'].rpc}`
        const apiUrl = `http://${rest}`
        neutronClient = new NeutronClient({
            apiURL: apiUrl,
            rpcURL: rpc,
            prefix: 'neutron',
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
            fs.readFileSync('../artifacts/credits.wasm'),
            1.5,
        )
        expect(creditsCodeId).toBeGreaterThan(0)
        const creditsres = await client.instantiate(deployer, creditsCodeId, {
            dao_address: deployer,
        }, 'credits', 'auto')
        creditsAddress = creditsres.contractAddress

        const {codeId: airdropCodeId} = await client.upload(
            deployer,
            fs.readFileSync('../artifacts/cw20_merkle_airdrop.wasm'),
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
            admin: deployer,
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
            fs.readFileSync('../../artifacts/neutron_airdrop_transfer-aarch64.wasm'),
            1.5,
        )
        claimerCodeId = claimerStoreRes.codeId;
        expect(claimerCodeId).toBeGreaterThan(0)

        const claimerres = await client.instantiate(deployer, claimerCodeId, {
            connection_id: connectionId,
            airdrop_address: airdropAddress, // incorrect address, migrated below
            interchain_account_id: 'neutron-funder',
            channel_id_to_hub: transferChannel.channel_id, // neutron to cosmoshub transfer channel id
            ibc_neutron_denom: ibcDenom,
        }, 'credits', 'auto');
        claimerAddress = claimerres.contractAddress;

        await client.migrate(deployer, airdropAddress, airdropCodeId, {
            reserve_address: claimerAddress,
        }, 'auto')
    }, 1000000);

    it.skip('mints money for airdrop in credits contract', async () => {
        // send money to credits
        await client.execute(deployer, creditsAddress, {
            mint: {}
        }, 'auto', 'mint in credits', [coin(9000, "untrn")])
        // TODO: check that money is minted on credits
    }, 1000000);

    it.skip('creates ICA account', async () => {
        await client.execute(deployer, claimerAddress, {
            create_hub_i_c_a: {},
        }, 'auto', 'create hub ica', [])

        // TODO: wait and check that ICA is indeed created
    }, 1000000);

    it.skip('Step 1 - claiming money from airdrop -> credits -> airdrop -> reserve_address (claimerAddress)', async () => {
        await client.execute(deployer, claimerAddress, {
            "claim_unclaimed": {},
        }, 'auto', 'mint in credits', [])

        const balance = await client.getBalance(claimerAddress, 'untrn')
        expect(balance.amount).toEqual(9000);
    }, 1000000);

    it.skip('Step 2 with timeout case', async () => {
        // migrate timeout to small value
        await client.migrate(deployer, claimerAddress, claimerCodeId, {
            transfer_timeout_seconds: 1,
            ica_timeout_seconds: 1,
        }, 'auto')

        // TODO: ibc send timeout should leave the stage at the send stage

        // TODO: migrate back to old timeout values

        await client.migrate(deployer, claimerAddress, claimerCodeId, {
            transfer_timeout_seconds: 600,
            ica_timeout_seconds: 600,
        }, 'auto')
    }, 1000000);

    it.skip('Step 2 - send claimed tokens to ICA account', async () => {
        await client.execute(deployer, claimerAddress, {
            send_claimed_tokens_to_i_c_a: {},
        }, 'auto', 'create hub ica', [{amount: '5000', denom: 'untrn'}])
        const balanceAfter = await client.getBalance(claimerAddress, 'untrn')
        expect(balanceAfter).toEqual(0);

        // TODO: wait and check balance of ICA
    }, 1000000);

    it.skip('Step 3 - send claimed tokens to ICA account', async () => {
        await client.execute(deployer, claimerAddress, {
            fund_community_pool: {},
        }, 'auto', 'fund community pool', [{ amount: '8000', denom: 'untrn' }])

        // TODO: check that ICA account now at 0 funds
        // TODO: check that community pool account is funded
    }, 1000000);
});

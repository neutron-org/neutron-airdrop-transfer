import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { SigningCosmWasmClient } from '@cosmjs/cosmwasm-stargate';
import {coin, DirectSecp256k1HdWallet} from '@cosmjs/proto-signing';
import { GasPrice } from '@cosmjs/stargate';
import { setupPark } from '../src/testSuite';
import fs from 'fs';
import Cosmopark from '@neutron-org/cosmopark';
import {getIBCDenom} from "@neutron-org/neutronjsplus/dist/helpers/cosmos";

describe('Test claim artifact', () => {
    const context: { park?: Cosmopark } = {};

    beforeAll(async () => {
        context.park = await setupPark('simple', ['neutron', 'gaia'], true);
    });

    afterAll(async () => {
        await context.park.stop();
    });

    let claimerCodeId: number;

    let creditsAddress: string;
    let airdropAddress: string;
    let claimerAddress: string;

    // untrn sent over transfer channel to gaia
    let ibcDenom: string;

    let client: SigningCosmWasmClient;
    let deployer: string;

    it('creates transfer channel TODO', async () => {
        expect(1).toBe(2);
    })
    //
    // it('deploys the contracts - airdrop, credits and claimer', async () => {
    //     const mnemonic = context.park.config.wallets.demowallet1.mnemonic
    //     const endpoint = `http://127.0.0.1:${context.park.ports['neutron'].rpc}`
    //     const options = {gasPrice: GasPrice.fromString('0.025untrn')}
    //     const walletOptions = {prefix: 'neutron'}
    //     const wallet = await DirectSecp256k1HdWallet.fromMnemonic(mnemonic, walletOptions)
    //     client = await SigningCosmWasmClient.connectWithSigner(endpoint, wallet, options)
    //     const accounts = await wallet.getAccounts()
    //     deployer = accounts[0].address;
    //
    //     // TODO
    //     ibcDenom = getIBCDenom('transfer', 'TODO: channel-? on gaia side?', 'untrn');
    //
    //     const {codeId: creditsCodeId} = await client.upload(
    //         deployer,
    //         fs.readFileSync('../contracts/credits.wasm'),
    //         1.5,
    //     )
    //     expect(creditsCodeId).toBeGreaterThan(0)
    //     const creditsres = await client.instantiate(deployer, creditsCodeId, {
    //         dao_address: deployer,
    //     }, 'credits', 'auto')
    //     creditsAddress = creditsres.contractAddress
    //
    //     console.log('Storing and instantiating airdrop contract...')
    //     const {codeId: airdropCodeId} = await client.upload(
    //         deployer,
    //         fs.readFileSync('../contracts/cw20_merkle_airdrop.wasm'),
    //         1.5,
    //     )
    //     expect(airdropCodeId).toBeGreaterThan(0)
    //     const airdropres = await client.instantiate(deployer, airdropCodeId, {
    //         credits_address: creditsAddress,
    //         reserve_address: deployer, // incorrect address, (set to main dao in prod), migrated here below
    //         merkle_root: '59d0f23be7d1bc58059decf25e01fdd7e2fd63df79957f59976f995160a44022', // random sha256 hash
    //         airdrop_start: 0,
    //         vesting_start: 1,
    //         vesting_duration_seconds: 1,
    //         total_amount: null,
    //         hrp: null
    //     }, 'airdrop', 'auto', {
    //         admin: deployer,
    //     })
    //     airdropAddress = airdropres.contractAddress
    //     expect(airdropAddress).toBeTruthy()
    //
    //     await client.execute(deployer, creditsAddress, {
    //         update_config: {
    //             config: {
    //                 airdrop_address: airdropAddress,
    //                 when_withdrawable: 0,
    //                 lockdrop_address: airdropAddress, // does not matter
    //             },
    //         },
    //     }, 'auto')
    //
    //     console.log('Storing and instantiating claimer contract...')
    //     const claimerStoreRes = await client.upload(
    //         deployer,
    //         fs.readFileSync('../artifacts/neutron_airdrop_transfer-aarch64.wasm'),
    //         1.5,
    //     )
    //     claimerCodeId = claimerStoreRes.codeId;
    //     expect(claimerCodeId).toBeGreaterThan(0)
    //
    //     const claimerres = await client.instantiate(deployer, claimerCodeId, {
    //         connection_id: toHubConnectionId,
    //         airdrop_address: airdropAddress, // incorrect address, migrated below
    //         interchain_account_id: 'neutron-funder',
    //         channel_id_to_hub: toHubChannelId, // neutron to cosmoshub transfer channel id
    //         ibc_neutron_denom: ibcDenom,
    //     }, 'credits', 'auto');
    //     claimerAddress = claimerres.contractAddress;
    //
    //     await client.migrate(deployer, airdropAddress, airdropCodeId, {
    //         reserve_address: claimerAddress,
    //     }, 'auto')
    // }, 1000000);
    //
    // it('mints money for airdrop in credits contract', async () => {
    //     // send money to credits
    //     await client.execute(deployer, creditsAddress, {
    //         mint: {}
    //     }, 'auto', 'mint in credits', [coin(9000, "untrn")])
    //     // TODO: check that money is minted on credits
    // }, 1000000);
    //
    // it('creates ICA account', async () => {
    //     await client.execute(deployer, claimerAddress, {
    //         create_hub_i_c_a: {},
    //     }, 'auto', 'create hub ica', [])
    //
    //     // TODO: wait and check that ICA is indeed created
    // }, 1000000);
    //
    // it('Step 1 - claiming money from airdrop -> credits -> airdrop -> reserve_address (claimerAddress)', async () => {
    //     await client.execute(deployer, claimerAddress, {
    //         "claim_unclaimed": {},
    //     }, 'auto', 'mint in credits', [])
    //
    //     const balance = await client.getBalance(claimerAddress, 'untrn')
    //     expect(balance.amount).toEqual(9000);
    // }, 1000000);
    //
    // it('Step 2 with timeout case', async () => {
    //     // migrate timeout to small value
    //     await client.migrate(deployer, claimerAddress, claimerCodeId, {
    //         transfer_timeout_seconds: 1,
    //         ica_timeout_seconds: 1,
    //     }, 'auto')
    //
    //     // TODO: ibc send timeout should leave the stage at the send stage
    //
    //     // TODO: migrate back to old timeout values
    // }, 1000000);
    //
    // it('')
    //
    // it('Step 2 - send claimed tokens to ICA account', async () => {
    //     await client.execute(deployer, claimerAddress, {
    //         send_claimed_tokens_to_i_c_a: {},
    //     }, 'auto', 'create hub ica', [{amount: '5000', denom: 'untrn'}])
    //     const balanceAfter = await client.getBalance(claimerAddress, 'untrn')
    //     expect(balanceAfter).toEqual(0);
    //
    //     // TODO: wait and check balance of ICA
    // }, 1000000);
    //
    // it('Step 3 - send claimed tokens to ICA account', async () => {
    //     await client.execute(deployer, claimerAddress, {
    //         fund_community_pool: {},
    //     }, 'auto', 'fund community pool', [{ amount: '8000', denom: 'untrn' }])
    //
    //     // TODO: check that ICA account now at 0 funds
    //     // TODO: check that community pool account is funded
    // }, 1000000);
});

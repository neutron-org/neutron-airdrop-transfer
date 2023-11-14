import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { SigningCosmWasmClient } from '@cosmjs/cosmwasm-stargate';
import { DirectSecp256k1HdWallet } from '@cosmjs/proto-signing';
import { GasPrice } from '@cosmjs/stargate';
import { setupPark } from '../src/testSuite';
import fs from 'fs';
import Cosmopark from '@neutron-org/cosmopark';
import { Client as NeutronClient } from "@neutron-org/client-ts";
import { V1IdentifiedChannel } from "@neutron-org/client-ts/src/ibc.core.channel.v1/rest";
import { getIBCDenom } from "../src/helpers/ibc_denom";
import { waitFor } from "../src/helpers/sleep";
import { GaiaClient } from "../src/helpers/gaia_client";

describe('Test claimer artifact', () => {
    const context: { park?: Cosmopark } = {}

    let client: SigningCosmWasmClient
    let neutronClient: any
    let hubClient: any
    let deployer: string

    let claimerCodeId: number
    let claimerAddress: string

    let transferChannel: V1IdentifiedChannel

    let ibcDenom: string

    beforeAll(async () => {
        // start neutron, gaia and hermes relayer
        context.park = await setupPark('simple', ['neutron', 'gaia'], true)

        const mnemonic = context.park.config.wallets.demowallet1.mnemonic
        const endpoint = `http://127.0.0.1:${context.park.ports['neutron'].rpc}`
        const options = {gasPrice: GasPrice.fromString('0.025untrn')}
        const walletOptions = {prefix: 'neutron'}
        const wallet = await DirectSecp256k1HdWallet.fromMnemonic(mnemonic, walletOptions)
        client = await SigningCosmWasmClient.connectWithSigner(endpoint, wallet, options)

        // deployer will deploy and manage all of our contracts for simplicity
        const accounts = await wallet.getAccounts()
        deployer = accounts[0].address

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

        const channelsRes = await neutronClient.IbcCoreChannelV1.query.queryChannels()
        transferChannel = channelsRes.data.channels.find(c => c.port_id === 'transfer' && c.state === 'STATE_OPEN')
        expect(transferChannel).toBeDefined()
        expect(transferChannel.port_id).toEqual('transfer')

        // untrn sent over transfer channel to gaia
        ibcDenom = getIBCDenom('transfer', transferChannel.counterparty.channel_id, 'untrn')
    }, 1000000)

    afterAll(async () => {
        if (context.park) {
            await context.park.stop()
        }
    })

    it('deploys the claimer contract', async () => {
        let connectionId = transferChannel.connection_hops[0]

        const claimerStoreRes = await client.upload(
            deployer,
            fs.readFileSync('../artifacts/neutron_airdrop_transfer.wasm'),
            1.5,
        )
        claimerCodeId = claimerStoreRes.codeId
        expect(claimerCodeId).toBeGreaterThan(0)

        const claimerRes = await client.instantiate(deployer, claimerCodeId, {
            connection_id: connectionId,
            transfer_channel_id: transferChannel.channel_id, // neutron to cosmoshub transfer channel id
            ibc_neutron_denom: ibcDenom,
            ibc_timeout_seconds: 3600 * 5,
        }, 'credits', 'auto', {
            admin: deployer // want to be able to migrate contract for testing purposes (set low timeout values)
        })
        claimerAddress = claimerRes.contractAddress
        expect(claimerAddress).toBeTruthy()
    }, 1000000)

    it('sends money to claimer contract', async () => {
        await client.sendTokens(deployer, claimerAddress, [{denom: 'untrn', amount: '9000'}], 'auto', '')

        const balance = await client.getBalance(claimerAddress, 'untrn')
        expect(balance.amount).toEqual('9000')
    }, 1000000)

    it('cannot run send_claimed_tokens_to_i_c_a or fund_community_pool before creating ICA account', async () => {
        await expect(() =>
            client.execute(deployer, claimerAddress, {
                send_claimed_tokens_to_i_c_a: {},
            }, 'auto', '', [])
        ).rejects.toThrowError(/ica is not created or open/)

        await expect(() =>
            client.execute(deployer, claimerAddress, {
                fund_community_pool: { amount: '9000' },
            }, 'auto', '', [])
        ).rejects.toThrowError(/ica is not created or open/)
    })

    it('creates ICA account', async () => {
        await client.execute(deployer, claimerAddress, {
            create_hub_i_c_a: {},
        }, 'auto', '', [])

        await waitFor(async () => {
            const ica = await client.queryContractSmart(claimerAddress, { interchain_account: {} })
            return !!(ica && ica.address)
        }, 350000)
    }, 1000000)

    it('[timeout] send claimed tokens to ICA account', async () => {
        const callbackStatesLengthBefore = (await client.queryContractSmart(claimerAddress, { ibc_callback_states: {} })).length

        // migrate to small timeout
        await client.migrate(deployer, claimerAddress, claimerCodeId, {
            ibc_timeout_seconds: 1,
        }, 'auto')

        await client.execute(deployer, claimerAddress, {
            send_claimed_tokens_to_i_c_a: {},
        }, 'auto', '', [{amount: '5000', denom: 'untrn'}])

        // wait until interchain tx is not in progress
        await waitFor(async () => {
            const callbackStates = await client.queryContractSmart(claimerAddress, { ibc_callback_states: {} })
            return callbackStates.length === callbackStatesLengthBefore + 1
        }, 500000)

        // expect timeout callback to be called
        const callbackStates = await client.queryContractSmart(claimerAddress, { ibc_callback_states: {} })
        expect(callbackStates.length).toEqual(callbackStatesLengthBefore + 1)
        expect(callbackStates[callbackStates.length - 1].timeout[0].source_port).toEqual('transfer')

        // funds still on contract
        const balanceAfter = await client.getBalance(claimerAddress, 'untrn')
        expect(balanceAfter.amount).toEqual('11500')

        // migrate back to ok timeout
        await client.migrate(deployer, claimerAddress, claimerCodeId, {
            ibc_timeout_seconds: 3600 * 5,
        }, 'auto')
    }, 1000000)

    it('[error] send claimed tokens to ICA account', async () => {
        const icaBefore = await client.queryContractSmart(claimerAddress, { interchain_account: {} })
        const callbackStatesLengthBefore = (await client.queryContractSmart(claimerAddress, { ibc_callback_states: {} })).length

        // expect to error when trying to send money to module account
        const moduleAccountResponse = await hubClient.CosmosAuthV1Beta1.query.queryModuleAccountByName('distribution')
        const moduleAccount = moduleAccountResponse.data.account.base_account.address
        await client.migrate(deployer, claimerAddress, claimerCodeId, {
            ica_address: moduleAccount,
        }, 'auto')

        // try to send funds to the module account
        await client.execute(deployer, claimerAddress, {
            send_claimed_tokens_to_i_c_a: {},
        }, 'auto', '', [{amount: '5000', denom: 'untrn'}])

        // wait until interchain tx is not in progress
        await waitFor(async () => {
            const callbackStates = await client.queryContractSmart(claimerAddress, { ibc_callback_states: {} })
            return callbackStates.length === callbackStatesLengthBefore + 1
        }, 500000)

        // check callbacks
        const callbackStates = await client.queryContractSmart(claimerAddress, { ibc_callback_states: {} })
        expect(callbackStates.length).toEqual(callbackStatesLengthBefore + 1)
        expect(callbackStates[callbackStates.length - 1].error[0].source_port).toEqual('transfer')
        expect(JSON.stringify(callbackStates[callbackStates.length - 1].error)).toMatch(/error handling packet/)

        // funds still on contract
        const balanceAfter = await client.getBalance(claimerAddress, 'untrn')
        expect(balanceAfter.amount).toEqual('14000')

        // get back value
        await client.migrate(deployer, claimerAddress, claimerCodeId, {
            ica_address: icaBefore.address,
        }, 'auto')
    })

    it('[success] send claimed tokens to ICA account', async () => {
        const callbackStatesLengthBefore = (await client.queryContractSmart(claimerAddress, { ibc_callback_states: {} })).length

        await client.execute(deployer, claimerAddress, {
            send_claimed_tokens_to_i_c_a: {},
        }, 'auto', '', [{amount: '5000', denom: 'untrn'}])

        // wait until interchain tx is not in progress
        await waitFor(async () => {
            const callbackStates = await client.queryContractSmart(claimerAddress, { ibc_callback_states: {} })
            return callbackStates.length === callbackStatesLengthBefore + 1
        }, 500000)

        // balance on contract should be 0 + 2500 refunded timeout fee
        const balanceAfter = await client.getBalance(claimerAddress, 'untrn')
        expect(balanceAfter.amount).toEqual('2500')

        // wait for balance to be present on hub ica
        const ica = await client.queryContractSmart(claimerAddress, { interchain_account: {} })
        const icaBalance = await hubClient.CosmosBankV1Beta1.query.queryBalance(ica.address, { denom: ibcDenom })
        // 9000 initially + refunded 5000 from 2 acks fee in step 2 = 14000
        expect(icaBalance.data.balance.amount).toEqual('14000')

        // check callbacks
        const callbackStates = await client.queryContractSmart(claimerAddress, { ibc_callback_states: {} })
        expect(callbackStates.length).toEqual(callbackStatesLengthBefore + 1)
        expect(callbackStates[callbackStates.length - 1].response[0].source_port).toEqual('transfer')
    }, 1000000)

    it('[timeout] fund community pool', async () => {
        // migrate to small timeout
        await client.migrate(deployer, claimerAddress, claimerCodeId, {
            ibc_timeout_seconds: 1,
        }, 'auto')

        // ica is present before the call
        const ica = await client.queryContractSmart(claimerAddress, { interchain_account: {} })
        expect(ica).toBeTruthy()

        const callbackStatesLengthBefore = (await client.queryContractSmart(claimerAddress, { ibc_callback_states: {} })).length

        await client.execute(deployer, claimerAddress, {
            fund_community_pool: { amount: '14000' },
        }, 'auto', 'fund community pool', [{ amount: '8000', denom: 'untrn' }])

        // wait until interchain tx is not in progress
        await waitFor(async () => {
            const callbackStates = await client.queryContractSmart(claimerAddress, { ibc_callback_states: {} })
            return callbackStates.length === callbackStatesLengthBefore + 1
        }, 500000)

        // check new callback
        const callbackStates = await client.queryContractSmart(claimerAddress, { ibc_callback_states: {} })
        expect(callbackStates.length).toEqual(callbackStatesLengthBefore + 1)
        expect(callbackStates[callbackStates.length - 1].timeout[0].sequence).toEqual(1)
        expect(callbackStates[callbackStates.length - 1].timeout[0].source_port).toEqual(ica.port_id)

        // ICA is removed
        const icaAfter = await client.queryContractSmart(claimerAddress, { interchain_account: {} })
        expect(icaAfter).toEqual(null)

        // migrate to old value
        await client.migrate(deployer, claimerAddress, claimerCodeId, {
            ibc_timeout_seconds: 5000,
        }, 'auto')
    })

    it('recreates ICA after timeout', async () => {
        await client.execute(deployer, claimerAddress, {
            create_hub_i_c_a: {},
        }, 'auto', '', [])

        await waitFor(async () => {
            const ica = await client.queryContractSmart(claimerAddress, { interchain_account: {} })
            return !!(ica && ica.address)
        }, 60000)
    })

    it('[error] fund community pool', async () => {
        const callbackStatesLengthBefore = (await client.queryContractSmart(claimerAddress, { ibc_callback_states: {} })).length

        // run step 3 with amount that is too big
        await client.execute(deployer, claimerAddress, {
            fund_community_pool: { amount: '125000' },
        }, 'auto', '', [{ amount: '8000', denom: 'untrn' }])

        // wait until interchain tx is not in progress
        await waitFor(async () => {
            const callbackStates = await client.queryContractSmart(claimerAddress, { ibc_callback_states: {} })
            return callbackStates.length === callbackStatesLengthBefore + 1
        }, 500000)

        const ica = await client.queryContractSmart(claimerAddress, { interchain_account: {} })
        expect(ica).toBeTruthy()

        const callbackStates = await client.queryContractSmart(claimerAddress, { ibc_callback_states: {} })
        expect(callbackStates.length).toEqual(callbackStatesLengthBefore + 1)
        expect(callbackStates[callbackStates.length - 1].error[0].source_port).toEqual(ica.port_id)
    })

    it('[success] fund community pool', async () => {
        const callbackStatesLengthBefore = (await client.queryContractSmart(claimerAddress, { ibc_callback_states: {} })).length

        await client.execute(deployer, claimerAddress, {
            fund_community_pool: { amount: '14000' },
        }, 'auto', '', [{ amount: '8000', denom: 'untrn' }])

        // wait until interchain tx is not in progress
        await waitFor(async () => {
            const callbackStates = await client.queryContractSmart(claimerAddress, { ibc_callback_states: {} })
            return callbackStates.length === callbackStatesLengthBefore + 1
        }, 500000)

        // should return callback
        const ica = await client.queryContractSmart(claimerAddress, { interchain_account: {} })
        const callbackStates = await client.queryContractSmart(claimerAddress, { ibc_callback_states: {} })
        expect(callbackStates.length).toEqual(callbackStatesLengthBefore + 1)
        expect(callbackStates[callbackStates.length - 1].response[0].source_port).toEqual(ica.port_id)

        // expect balance to be 0 on ICA after funding
        const icaBalance = await hubClient.CosmosBankV1Beta1.query.queryBalance(ica.address, { denom: ibcDenom })
        expect(icaBalance.data.balance.amount).toEqual('0')

        // expect community pool to have transferred funds
        const moduleAccountResponse = await hubClient.CosmosAuthV1Beta1.query.queryModuleAccountByName('distribution')
        const moduleAccount = moduleAccountResponse.data.account.base_account.address
        const icaBalanceInPool = await hubClient.CosmosBankV1Beta1.query.queryBalance(moduleAccount, { denom: ibcDenom })
        expect(icaBalanceInPool.data.balance.amount).toEqual('14000')
    }, 1000000)
})

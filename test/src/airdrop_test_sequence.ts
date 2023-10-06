import { SigningCosmWasmClient } from '@cosmjs/cosmwasm-stargate';
import { AccountData, DirectSecp256k1HdWallet } from '@cosmjs/proto-signing';
import { SigningStargateClient } from '@cosmjs/stargate';
import { Decimal } from "@cosmjs/math";
import fs from 'fs';
import {coin} from "@cosmjs/amino/build/coins";

export async function AirdropTest(walletMnemonic: string): Promise<void> {
    // prepare...
    const wallet: DirectSecp256k1HdWallet = await DirectSecp256k1HdWallet.fromMnemonic(walletMnemonic, {
        prefix: 'neutron',
    })
    const accounts = await wallet.getAccounts();
    const instantiator = accounts[0].address;
    console.log('instantiator: ' + instantiator);

    const cosmwasm = await SigningCosmWasmClient.connectWithSigner(`http://127.0.0.1:26657`, wallet, {
        gasPrice: {
            denom: 'untrn',
            amount: Decimal.fromUserInput("0.025", 6)
        }
    })



    console.log('Storing and instantiating credits contract...')
    const { codeId: creditsCodeId } = await cosmwasm.upload(
        instantiator,
        fs.readFileSync('./contracts/credits.wasm'),
        1.5,
    )
    const creditsres = await cosmwasm.instantiate(instantiator, creditsCodeId, {
        dao_address: instantiator,
    }, 'credits','auto');
    // console.log('creditsres: ' + JSON.stringify(creditsres))
    const creditsAddress = creditsres.contractAddress;





    console.log('Storing and instantiating airdrop contract...')
    const { codeId: airdropCodeId } = await cosmwasm.upload(
        instantiator,
        fs.readFileSync('./contracts/cw20_merkle_airdrop.wasm'),
        1.5,
    )

    const airdropres = await cosmwasm.instantiate(instantiator, airdropCodeId, {
        credits_address: creditsAddress,
        reserve_address: instantiator, // incorrect address, (set to main dao in prod), migrated here below
        merkle_root: '59d0f23be7d1bc58059decf25e01fdd7e2fd63df79957f59976f995160a44022', // random sha256 hash
        airdrop_start: 0,
        vesting_start: 1,
        vesting_duration_seconds: 1,
        total_amount: null,
        hrp: null
    }, 'airdrop','auto', {
        admin: instantiator,
    })
    const airdropAddress = airdropres.contractAddress






    const updateconfigres = await cosmwasm.execute(instantiator, creditsAddress, {
        update_config: {
            config: {
                airdrop_address: airdropAddress,
                when_withdrawable: 0,
                lockdrop_address: airdropAddress, // does not matter
            },
        },
    }, 'auto')
    // console.log('updateconfigres ' + JSON.stringify(updateconfigres))





    console.log('Storing and instantiating claimer contract...')
    const { codeId: claimerCodeId } = await cosmwasm.upload(
        instantiator,
        fs.readFileSync('../artifacts/neutron_airdrop_transfer-aarch64.wasm'),
        1.5,
    )
    const claimerres = await cosmwasm.instantiate(instantiator, claimerCodeId, {
        connection_id: 'connection-0',
        airdrop_address: airdropAddress, // incorrect address, migrated below
        interchain_account_id: 'neutron-funder',
        cosmoshub_channel: 'channel-0', // TODO!
        ibc_neutron_denom: 'ibc/kekw', // TODO
        hub_revision_number: 1,
    }, 'credits','auto');
    // console.log('claimerres: ' + JSON.stringify(claimerres))
    const claimerAddress = claimerres.contractAddress;





    const migrateres = await cosmwasm.migrate(instantiator, airdropAddress, airdropCodeId, {
        reserve_address: claimerAddress,
    }, 'auto')
    // console.log('migrateres ' + JSON.stringify(migrateres))






    console.log('Sending money to the credits (mint)')
    const sendmoneyres = await cosmwasm.execute(instantiator, creditsAddress, {
        mint: {}
    }, 'auto', 'mint in credits', [coin(9000, "untrn")])
    console.log('sendmoneyres ' + JSON.stringify(sendmoneyres));

    console.log('Step 1 - claiming money from airdrop -> credits -> airdrop -> reserve_address (claimerAddress)')
    const claimmoneyres = await cosmwasm.execute(instantiator, claimerAddress, {
        "claim_unclaimed": {},
    }, 'auto', 'mint in credits', [])
    console.log('claimmoneyres ' + JSON.stringify(claimmoneyres));

    console.log('Step 1 check')
    const balance = await cosmwasm.getBalance(claimerAddress, 'untrn')
    console.log('Balance of claimer account (should be 9000): ' + JSON.stringify(balance))

    console.log('Step 2 - create hub ica')
    const createhubicares = await cosmwasm.execute(instantiator, claimerAddress, {
        "create_hub_ica": {},
    }, 'auto', 'create hub ica', [])
    console.log('createhubicares ' + JSON.stringify(createhubicares));

    console.log('Step 3 - send claimed tokens to ica')
    const sendtokenstoicares = await cosmwasm.execute(instantiator, claimerAddress, {
        "send_claimed_tokens_to_ica": {},
    }, 'auto', 'send tokens to ica', [])
    console.log('sendtokenstoicares ' + JSON.stringify(sendtokenstoicares));

    console.log('Step 4 - fund community pool')
    const fundcommunitypoolres = await cosmwasm.execute(instantiator, claimerAddress, {
        "fund_community_pool": {},
    }, 'auto', 'fund community pool', [])
    console.log('fundcommunitypoolres ' + JSON.stringify(fundcommunitypoolres));
}

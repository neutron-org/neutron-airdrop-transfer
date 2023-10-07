import fs from 'fs';
import {coin} from "@cosmjs/amino/build/coins";
import {Connection} from "./connector";

export async function SetupContracts(c: Connection): Promise<void> {
    console.log('Storing and instantiating credits contract...')
    const { codeId: creditsCodeId } = await c.client.upload(
        c.owner,
        fs.readFileSync('./contracts/credits.wasm'),
        1.5,
    )
    const creditsres = await c.client.instantiate(c.owner, creditsCodeId, {
        dao_address: c.owner,
    }, 'credits','auto');
    console.log('creditsres: ' + JSON.stringify(creditsres))
    const creditsAddress = creditsres.contractAddress;

    console.log('Storing and instantiating airdrop contract...')
    const { codeId: airdropCodeId } = await c.client.upload(
        c.owner,
        fs.readFileSync('./contracts/cw20_merkle_airdrop.wasm'),
        1.5,
    )

    const airdropres = await c.client.instantiate(c.owner, airdropCodeId, {
        credits_address: creditsAddress,
        reserve_address: c.owner, // incorrect address, (set to main dao in prod), migrated here below
        merkle_root: '59d0f23be7d1bc58059decf25e01fdd7e2fd63df79957f59976f995160a44022', // random sha256 hash
        airdrop_start: 0,
        vesting_start: 1,
        vesting_duration_seconds: 1,
        total_amount: null,
        hrp: null
    }, 'airdrop','auto', {
        admin: c.owner,
    })
    const airdropAddress = airdropres.contractAddress

    const updateconfigres = await c.client.execute(c.owner, creditsAddress, {
        update_config: {
            config: {
                airdrop_address: airdropAddress,
                when_withdrawable: 0,
                lockdrop_address: airdropAddress, // does not matter
            },
        },
    }, 'auto')
    console.log('updateconfigres ' + JSON.stringify(updateconfigres))

    console.log('Storing and instantiating claimer contract...')
    const { codeId: claimerCodeId } = await c.client.upload(
        c.owner,
        fs.readFileSync('../artifacts/neutron_airdrop_transfer-aarch64.wasm'),
        1.5,
    )
    const claimerres = await c.client.instantiate(c.owner, claimerCodeId, {
        connection_id: 'connection-0',
        airdrop_address: airdropAddress, // incorrect address, migrated below
        interchain_account_id: 'neutron-funder',
        cosmoshub_channel: 'channel-0', // neutron to cosmoshub transfer channel id
        ibc_neutron_denom: 'ibc/kekw', // TODO
        hub_revision_number: 1,
    }, 'credits','auto');
    console.log('claimerres: ' + JSON.stringify(claimerres))
    const claimerAddress = claimerres.contractAddress;

    const migrateres = await c.client.migrate(c.owner, airdropAddress, airdropCodeId, {
        reserve_address: claimerAddress,
    }, 'auto')
    console.log('migrateres ' + JSON.stringify(migrateres))

    console.log('Prestep - Sending money to the credits (mint)')
    const sendmoneyres = await c.client.execute(c.owner, creditsAddress, {
        mint: {}
    }, 'auto', 'mint in credits', [coin(9000, "untrn")])
    console.log('sendmoneyres ' + JSON.stringify(sendmoneyres));

    const res = {
        creditsAddress,
        airdropAddress,
        claimerAddress
    }

    console.log(JSON.stringify('Result contracts:\n' + JSON.stringify(res) + '\n\n'))
}

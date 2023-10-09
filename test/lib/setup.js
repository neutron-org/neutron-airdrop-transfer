"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SetupContracts = void 0;
const fs_1 = __importDefault(require("fs"));
const coins_1 = require("@cosmjs/amino/build/coins");
async function SetupContracts(c, toHubConnectionId, toHubChannelId, ibcNeutronDenom) {
    console.log('Storing and instantiating credits contract...');
    const { codeId: creditsCodeId } = await c.client.upload(c.owner, fs_1.default.readFileSync('./contracts/credits.wasm'), 1.5);
    const creditsres = await c.client.instantiate(c.owner, creditsCodeId, {
        dao_address: c.owner,
    }, 'credits', 'auto');
    console.log('creditsres: ' + JSON.stringify(creditsres));
    const creditsAddress = creditsres.contractAddress;
    console.log('Storing and instantiating airdrop contract...');
    const { codeId: airdropCodeId } = await c.client.upload(c.owner, fs_1.default.readFileSync('./contracts/cw20_merkle_airdrop.wasm'), 1.5);
    const airdropres = await c.client.instantiate(c.owner, airdropCodeId, {
        credits_address: creditsAddress,
        reserve_address: c.owner,
        merkle_root: '59d0f23be7d1bc58059decf25e01fdd7e2fd63df79957f59976f995160a44022',
        airdrop_start: 0,
        vesting_start: 1,
        vesting_duration_seconds: 1,
        total_amount: null,
        hrp: null
    }, 'airdrop', 'auto', {
        admin: c.owner,
    });
    const airdropAddress = airdropres.contractAddress;
    const updateconfigres = await c.client.execute(c.owner, creditsAddress, {
        update_config: {
            config: {
                airdrop_address: airdropAddress,
                when_withdrawable: 0,
                lockdrop_address: airdropAddress, // does not matter
            },
        },
    }, 'auto');
    console.log('updateconfigres ' + JSON.stringify(updateconfigres));
    console.log('Storing and instantiating claimer contract...');
    const { codeId: claimerCodeId } = await c.client.upload(c.owner, fs_1.default.readFileSync('../artifacts/neutron_airdrop_transfer-aarch64.wasm'), 1.5);
    const claimerres = await c.client.instantiate(c.owner, claimerCodeId, {
        connection_id: toHubConnectionId,
        airdrop_address: airdropAddress,
        interchain_account_id: 'neutron-funder',
        channel_id_to_hub: toHubChannelId,
        ibc_neutron_denom: ibcNeutronDenom,
    }, 'credits', 'auto');
    console.log('claimerres: ' + JSON.stringify(claimerres));
    const claimerAddress = claimerres.contractAddress;
    const migrateres = await c.client.migrate(c.owner, airdropAddress, airdropCodeId, {
        reserve_address: claimerAddress,
    }, 'auto');
    console.log('migrateres ' + JSON.stringify(migrateres));
    console.log('Prestep - Sending money to the credits (mint)');
    const sendmoneyres = await c.client.execute(c.owner, creditsAddress, {
        mint: {}
    }, 'auto', 'mint in credits', [(0, coins_1.coin)(9000, "untrn")]);
    console.log('sendmoneyres ' + JSON.stringify(sendmoneyres));
    const res = {
        creditsAddress,
        airdropAddress,
        claimerAddress
    };
    console.log('Result contracts:\n' + JSON.stringify(res) + '\n\n');
}
exports.SetupContracts = SetupContracts;

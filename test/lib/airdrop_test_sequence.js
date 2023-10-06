"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AirdropTest = void 0;
const cosmwasm_stargate_1 = require("@cosmjs/cosmwasm-stargate");
const proto_signing_1 = require("@cosmjs/proto-signing");
const math_1 = require("@cosmjs/math");
const fs_1 = __importDefault(require("fs"));
const coins_1 = require("@cosmjs/amino/build/coins");
async function AirdropTest(walletMnemonic) {
    // prepare...
    const wallet = await proto_signing_1.DirectSecp256k1HdWallet.fromMnemonic(walletMnemonic, {
        prefix: 'neutron',
    });
    const accounts = await wallet.getAccounts();
    const instantiator = accounts[0].address;
    console.log('instantiator: ' + instantiator);
    const cosmwasm = await cosmwasm_stargate_1.SigningCosmWasmClient.connectWithSigner(`http://127.0.0.1:26657`, wallet, {
        gasPrice: {
            denom: 'untrn',
            amount: math_1.Decimal.fromUserInput("0.025", 6)
        }
    });
    console.log('Storing and instantiating credits contract...');
    const { codeId: creditsCodeId } = await cosmwasm.upload(instantiator, fs_1.default.readFileSync('./contracts/credits.wasm'), 1.5);
    const creditsres = await cosmwasm.instantiate(instantiator, creditsCodeId, {
        dao_address: instantiator,
    }, 'credits', 'auto');
    // console.log('creditsres: ' + JSON.stringify(creditsres))
    const creditsAddress = creditsres.contractAddress;
    console.log('Storing and instantiating airdrop contract...');
    const { codeId: airdropCodeId } = await cosmwasm.upload(instantiator, fs_1.default.readFileSync('./contracts/cw20_merkle_airdrop.wasm'), 1.5);
    const airdropres = await cosmwasm.instantiate(instantiator, airdropCodeId, {
        credits_address: creditsAddress,
        reserve_address: instantiator,
        merkle_root: '59d0f23be7d1bc58059decf25e01fdd7e2fd63df79957f59976f995160a44022',
        airdrop_start: 0,
        vesting_start: 1,
        vesting_duration_seconds: 1,
        total_amount: null,
        hrp: null
    }, 'airdrop', 'auto', {
        admin: instantiator,
    });
    const airdropAddress = airdropres.contractAddress;
    const updateconfigres = await cosmwasm.execute(instantiator, creditsAddress, {
        update_config: {
            config: {
                airdrop_address: airdropAddress,
                when_withdrawable: 0,
                lockdrop_address: airdropAddress, // does not matter
            },
        },
    }, 'auto');
    // console.log('updateconfigres ' + JSON.stringify(updateconfigres))
    console.log('Storing and instantiating claimer contract...');
    const { codeId: claimerCodeId } = await cosmwasm.upload(instantiator, fs_1.default.readFileSync('../artifacts/neutron_airdrop_transfer-aarch64.wasm'), 1.5);
    const claimerres = await cosmwasm.instantiate(instantiator, claimerCodeId, {
        connection_id: 'connection-0',
        airdrop_address: airdropAddress,
        interchain_account_id: 'neutron-funder',
        cosmoshub_channel: 'channel-0',
        ibc_neutron_denom: 'ibc/kekw',
        hub_revision_number: 1,
    }, 'credits', 'auto');
    // console.log('claimerres: ' + JSON.stringify(claimerres))
    const claimerAddress = claimerres.contractAddress;
    const migrateres = await cosmwasm.migrate(instantiator, airdropAddress, airdropCodeId, {
        reserve_address: claimerAddress,
    }, 'auto');
    // console.log('migrateres ' + JSON.stringify(migrateres))
    console.log('Sending money to the credits (mint)');
    const sendmoneyres = await cosmwasm.execute(instantiator, creditsAddress, {
        mint: {}
    }, 'auto', 'mint in credits', [(0, coins_1.coin)(9000, "untrn")]);
    // console.log('sendmoneyres ' + JSON.stringify(sendmoneyres));
    console.log('Step 1 - claiming money from airdrop -> credits -> airdrop -> reserve_address (claimerAddress)');
    const claimmoneyres = await cosmwasm.execute(instantiator, claimerAddress, {
        "claim_unclaimed": {},
    }, 'auto', 'mint in credits', []);
    // console.log('claimmoneyres ' + JSON.stringify(claimmoneyres));
    console.log('Step 1 check');
    const balance = await cosmwasm.getBalance(claimerAddress, 'untrn');
    console.log('Balance of claimer account: ' + JSON.stringify(balance));
}
exports.AirdropTest = AirdropTest;

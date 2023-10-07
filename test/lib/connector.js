"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Connect = exports.Connection = void 0;
const cosmwasm_stargate_1 = require("@cosmjs/cosmwasm-stargate");
const proto_signing_1 = require("@cosmjs/proto-signing");
const math_1 = require("@cosmjs/math");
class Connection {
    client;
    owner;
    constructor(cosmwasm, instantiator) {
        this.client = cosmwasm;
        this.owner = instantiator;
    }
}
exports.Connection = Connection;
async function Connect(walletMnemonic, endpoint) {
    const wallet = await proto_signing_1.DirectSecp256k1HdWallet.fromMnemonic(walletMnemonic, {
        prefix: 'neutron',
    });
    const accounts = await wallet.getAccounts();
    const instantiator = accounts[0].address;
    console.log('instantiator: ' + instantiator);
    const cosmwasm = await cosmwasm_stargate_1.SigningCosmWasmClient.connectWithSigner(endpoint, wallet, {
        gasPrice: {
            denom: 'untrn',
            amount: math_1.Decimal.fromUserInput("0.025", 6)
        }
    });
    return new Connection(cosmwasm, instantiator);
}
exports.Connect = Connect;

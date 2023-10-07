import { SigningCosmWasmClient } from '@cosmjs/cosmwasm-stargate';
import { DirectSecp256k1HdWallet } from '@cosmjs/proto-signing';
import { Decimal } from "@cosmjs/math";

export class Connection {
    client: SigningCosmWasmClient;
    owner: string;

    constructor(cosmwasm, instantiator) {
        this.client = cosmwasm;
        this.owner = instantiator;
    }
}

export async function Connect(walletMnemonic: string, endpoint: string): Promise<Connection> {
    const wallet: DirectSecp256k1HdWallet = await DirectSecp256k1HdWallet.fromMnemonic(walletMnemonic, {
        prefix: 'neutron',
    })
    const accounts = await wallet.getAccounts();
    const instantiator = accounts[0].address;
    console.log('instantiator: ' + instantiator);

    const cosmwasm = await SigningCosmWasmClient.connectWithSigner(endpoint, wallet, {
        gasPrice: {
            denom: 'untrn',
            amount: Decimal.fromUserInput("0.025", 6)
        }
    })

    return new Connection(cosmwasm, instantiator)
}
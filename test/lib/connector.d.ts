import { SigningCosmWasmClient } from '@cosmjs/cosmwasm-stargate';
export declare class Connection {
    client: SigningCosmWasmClient;
    owner: string;
    constructor(cosmwasm: any, instantiator: any);
}
export declare function Connect(walletMnemonic: string, endpoint: string): Promise<Connection>;

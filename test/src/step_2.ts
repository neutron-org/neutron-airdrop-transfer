import {Connection} from "./connector";

export async function Step2(c: Connection, claimerAddress: string): Promise<void> {
    console.log('Step 2 - create hub ica')
    const createhubicares = await c.client.execute(c.owner, claimerAddress, {
        create_hub_i_c_a: {},
    }, 'auto', 'create hub ica', [])
    console.log('createhubicares ' + JSON.stringify(createhubicares))

    console.log('Step 2 check')
    const icaResponse = await c.client.queryContractSmart(claimerAddress, { interchain_account: {} })
    console.log('ICA address: ' + icaResponse)
}

import {Connection} from "./connector";

export async function Step3(c: Connection, claimerAddress: string): Promise<void> {
    console.log('Step 3 - sending tokens to the ica')
    const sendtoicares = await c.client.execute(c.owner, claimerAddress, {
        send_claimed_tokens_to_i_c_a: {},
    }, 'auto', 'create hub ica', [{ amount: '5000', denom: 'untrn' }])
    console.log('createhubicares ' + JSON.stringify(sendtoicares))

    console.log('Step 3 check')
    const balanceAfter = await c.client.getBalance(claimerAddress, 'untrn')
    console.log('Balance of claimer account (should be 0): ' + JSON.stringify(balanceAfter))
    console.log('Stage: ' + JSON.stringify(await c.client.queryContractSmart(claimerAddress, { stage: {} })))
}

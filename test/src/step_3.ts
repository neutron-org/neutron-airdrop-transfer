import {Connection} from "./connector";

export async function Step3(c: Connection, claimerAddress: string): Promise<void> {
    console.log('Step 3 check')
    const balanceAfter = await c.client.getBalance(claimerAddress, 'untrn')
    console.log('Balance of claimer account (should be 0): ' + JSON.stringify(balanceAfter))
    console.log('Stage: ' + await c.client.queryContractSmart(claimerAddress, { stage: {} }))
}
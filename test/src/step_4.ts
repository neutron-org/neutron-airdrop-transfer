import {Connection} from "./connector";

export async function Step4(c: Connection, claimerAddress: string): Promise<void> {
    console.log('Step 4 - fund community pool')
    const fundcommunitypoolres = await c.client.execute(c.owner, claimerAddress, {
        fund_community_pool: {},
    }, 'auto', 'fund community pool', [{ amount: '8000', denom: 'untrn' }])
    console.log('fundcommunitypoolres ' + JSON.stringify(fundcommunitypoolres))
}

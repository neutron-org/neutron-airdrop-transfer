import {Connection} from "./connector";

export async function Step1(c: Connection, claimerAddress: string): Promise<void> {
    console.log('Step 1 - claiming money from airdrop -> credits -> airdrop -> reserve_address (claimerAddress)')
    const claimmoneyres = await c.client.execute(c.owner, claimerAddress, {
        "claim_unclaimed": {},
    }, 'auto', 'mint in credits', [])
    console.log('claimmoneyres ' + JSON.stringify(claimmoneyres));

    console.log('Step 1 check')
    const balance = await c.client.getBalance(claimerAddress, 'untrn')
    console.log('Balance of claimer account (should be 9000): ' + JSON.stringify(balance))
}

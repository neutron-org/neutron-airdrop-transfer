"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Step4 = void 0;
async function Step4(c, claimerAddress) {
    console.log('Step 4 - fund community pool');
    const fundcommunitypoolres = await c.client.execute(c.owner, claimerAddress, {
        fund_community_pool: {},
    }, 'auto', 'fund community pool', []);
    console.log('fundcommunitypoolres ' + JSON.stringify(fundcommunitypoolres));
    console.log('Step 4 check');
    console.log('ICA address: ' + await c.client.queryContractSmart(claimerAddress, { transfer_amount: {} }));
    console.log('Stage: ' + await c.client.queryContractSmart(claimerAddress, { stage: {} }));
}
exports.Step4 = Step4;

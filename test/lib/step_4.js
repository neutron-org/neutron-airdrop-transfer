"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Step4 = void 0;
async function Step4(c, claimerAddress) {
    console.log('Step 4 - fund community pool');
    const fundcommunitypoolres = await c.client.execute(c.owner, claimerAddress, {
        fund_community_pool: {},
    }, 'auto', 'fund community pool', [{ amount: '8000', denom: 'untrn' }]);
    console.log('fundcommunitypoolres ' + JSON.stringify(fundcommunitypoolres));
}
exports.Step4 = Step4;

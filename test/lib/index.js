#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const commander_1 = require("commander");
const airdrop_test_sequence_1 = require("./airdrop_test_sequence");
if (require.main === module) {
    commander_1.program
        .name('pion-1_airdrop_transfer_test')
        .description('CLI to start your own cosmos')
        .command('start')
        .argument('<wallet>', 'wallet mnemonic')
        .action(async (wallet) => {
        (0, airdrop_test_sequence_1.AirdropTest)(wallet);
        console.log('🥳 Done');
    });
    commander_1.program.parse();
}

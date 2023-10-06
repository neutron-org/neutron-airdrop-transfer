#!/usr/bin/env node
import { program } from 'commander';
import { AirdropTest } from "./airdrop_test_sequence";

if (require.main === module) {
    program
        .name('pion-1_airdrop_transfer_test')
        .description('CLI to start your own cosmos')
        .command('start')
        .argument('<wallet>', 'wallet mnemonic')
        .action(async (wallet) => {
            await AirdropTest(wallet);
            console.log('🥳 Done');
        });

    program.parse();
}

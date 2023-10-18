# Transfer unclaimed airdrop funds from neutron-1 to cosmoshub-4

# Test
`make build`

`cd ./integration-tests`

`yarn build`

`yarn test`

# How to
how to learn denom
```sh
neutrond tx ibc-transfer transfer "transfer" "channel-189" "cosmos1mwfj5j8v2aafqqnjekeqtupgc6894033nvtgre" "100untrn" --chain-id pion-1 --home "~/.neutrond" --node "https://rpc-falcron.pion-1.ntrn.tech:443" --from "pion1_testnet_wallet" --keyring-backend test
gaiad q bank balances cosmos1mwfj5j8v2aafqqnjekeqtupgc6894033nvtgre --home ~/.gaiad-theta --node https://rpc.sentry-02.theta-testnet.polypore.xyz:443
```

how to query community pool:
```
## query community pool
gaiad q auth module-account distribution --chain-id theta-testnet-001 --node "https://rpc.sentry-02.theta-testnet.polypore.xyz:443"
gaiad q bank balances cosmos1jv65s3grqf6v6jl3dp4t6c9t9rk99cd88lyufl --chain-id theta-testnet-001 --node "https://rpc.sentry-02.theta-testnet.polypore.xyz:443"
https://testnet.mintscan.io/cosmoshub-testnet/account/cosmos1jv65s3grqf6v6jl3dp4t6c9t9rk99cd88lyufl
```

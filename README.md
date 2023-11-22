# The contract implements a logic to transfer `NTRN` tokens to Cosmos Hub Community Pool.

### Methods

- `CreateHubICA` *-* creates an ICA on a remote chain;
- `SendClaimedTokensToICA` - send all NTRN tokens from the contract to the created ICA via IBC;
- `FundCommunityPool` *-* issues an ICTX to fund a community pool with previously transfered NTRN tokens.

## Run integration tests

Prerequisites to run tests:
- rustup
- node >= v16
- docker-compose version >= 2.22.0
- cloned repos (see below)

Our integration tests need several external repos to run.

You'll need to place these repos in this structure:
```
├── gaia
├── neutron
└── neutron-airdrop-transfer (this repo)
```

1. Clone gaia and checkout current version:
```sh
git clone git@github.com:cosmos/gaia.git
git fetch
git checkout v13.0.0
```

2. Clone neutron and checkout current version:
```sh
git clone git@github.com:neutron-org/neutron.git
git fetch
git checkout v1.0.4
```

3. Go to this repo root and build contracts (rustup needed)
```sh
cd ./neutron-airdrop-transfer
make build
```

4. Go inside PROJECT_ROOT/integration-tests folder and build docker images:
```sh
cd ./integration-tests
make build-all
```

5. Install npm packets and run tests now:
```sh
yarn
yarn test
```

## Other

How to query community pool balance:
```
## query community pool
gaiad q auth module-account distribution --chain-id theta-testnet-001 --node "https://rpc.sentry-02.theta-testnet.polypore.xyz:443"
gaiad q bank balances cosmos1jv65s3grqf6v6jl3dp4t6c9t9rk99cd88lyufl --chain-id theta-testnet-001 --node "https://rpc.sentry-02.theta-testnet.polypore.xyz:443"
https://testnet.mintscan.io/cosmoshub-testnet/account/cosmos1jv65s3grqf6v6jl3dp4t6c9t9rk99cd88lyufl
```

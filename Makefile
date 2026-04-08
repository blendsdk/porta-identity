.PHONY: dev build test lint format docker-up docker-down verify clean

dev:
	yarn dev

build:
	yarn build

test:
	yarn test

test-unit:
	yarn test:unit

test-integration:
	yarn test:integration

lint:
	yarn lint

lint-fix:
	yarn lint:fix

format:
	yarn format

docker-up:
	yarn docker:up

docker-down:
	yarn docker:down

verify:
	yarn verify

clean:
	rm -rf dist node_modules

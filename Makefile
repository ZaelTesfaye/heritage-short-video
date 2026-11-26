# `make film` is the one command. On Windows without make, use the npm scripts directly: `npm run film`.
LANG_CODE ?= am

.PHONY: install film radio validate smoke test costs

install:
	npm install

film: install
	npm run film -- --lang $(LANG_CODE)

radio: install
	npm run radio -- --lang $(LANG_CODE)

validate:
	npm run validate

smoke:
	npm run smoke

test:
	npm test

costs:
	npm run costs

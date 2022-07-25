# Node Boilerplate

Node boilerplate that includes multiple best practices and useful tools such as:

* Yarn
* Typescript
* ESLint
* Prettier
* Tests with Jest
* Configuration implementation with validation
* Logger implementation with Winston
* Github actions

## Available Scripts

- `start` - runs the code directly from typescript
- `build` - transpile TypeScript to ES6
- `prod` - runs the builded code
- `docs` - generate docs from code natspec
- `lint` - lint source files and tests
- `test` - run tests
- `test:coverage` - analyses the code coverage

## Configuration

As probably your next proyect needs some sort of configuration, here is an implementation that might help.

The user will need to create configuration json file, up to you if it is gitignored, and then provide the path to the file by process arguments. This allows the user to have different files for multiple environments.

The user configuration is validated against a defined schema using Yup.

In order to start the main script you would run:
```
yarn start --config example.config.json
```

## Logger

Winston implementation that prints the logs as JSON with the service name.

Configuration can be provided in order to specify the log level and whether to save them to a file or not.
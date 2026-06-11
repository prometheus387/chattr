# Chattr Frontend

## To-Do's
- Dropdown Support in Navbar
- All of the client
- Auth and Auth Provider

## Commands
### Creating components
```bash
# Components
ng generate componente component/example
ng g c component/example

# Service
ng generate service core/services/chat
ng g s core/services/chat

# Guard
ng generate guard core/guards/auth
ng g g core/guards/auth

# Interface
ng generate interface core/models/message
ng g i core/models/message

# Custom Pipe
ng generate pipe shared/pipes/chat-date
ng g p shared/pipes/chat-date
```


This project was generated using [Angular CLI](https://github.com/angular/angular-cli) version 21.2.14.

## Development server

To start a local development server, run:

```bash
ng serve
```

Once the server is running, open your browser and navigate to `http://localhost:4200/`. The application will automatically reload whenever you modify any of the source files.

## Code scaffolding

Angular CLI includes powerful code scaffolding tools. To generate a new component, run:

```bash
ng generate component component-name
```

For a complete list of available schematics (such as `components`, `directives`, or `pipes`), run:

```bash
ng generate --help
```

## Building

To build the project run:

```bash
ng build
```

This will compile your project and store the build artifacts in the `dist/` directory. By default, the production build optimizes your application for performance and speed.

## Running unit tests

To execute unit tests with the [Vitest](https://vitest.dev/) test runner, use the following command:

```bash
ng test
```

## Running end-to-end tests

For end-to-end (e2e) testing, run:

```bash
ng e2e
```

Angular CLI does not come with an end-to-end testing framework by default. You can choose one that suits your needs.

## Additional Resources

For more information on using the Angular CLI, including detailed command references, visit the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.

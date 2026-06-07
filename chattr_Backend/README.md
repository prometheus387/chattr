# Chattr Backend

**Informations for building, debugging and developing!**

The project stack is a bit complicated.
Backend C# Multi Project Solution with ASP.NET and EF Core...
and frontend with React or maybe Nextjs... who knows...

## Project Setup

First of all, set the project secrets in an .env in the main backend folder.

It should look like this:

```env
POSTGRES_PASSWORD=<plain-password>
CAP_ADMIN_KEY=<12-char-long-password-at-least>
CAP_SECRETKEY=sk-<can-be-set-after-retrieving-from-capsite>
CAP_SITEKEY=<this-too-like-sk>

SEQ_FIRSTRUN_ADMINPASSWORDHASH=<hash>
```

The `SEQ_FIRSTRUN_ADMINPASSWORDHASH` is a special case, because you need to generate it with this command:

```sh
export SEQ_FIRSTRUN_ADMINPASSWORDHASH="$(echo 'change-me' | docker run --rm -i datalust/seq:latest config hash)"
```

After this command, you can simply do `echo $SEQ_FIRSTRUN_ADMINPASSWORDHASH` and copy paste it.

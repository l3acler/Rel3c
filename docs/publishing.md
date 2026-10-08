# Publish and maintain the documentation

The site is built from the repository's public Markdown guides and deployed to
GitHub Pages by [the documentation workflow](../.github/workflows/docs.yml).
It includes the TodoMVC app and the same local `src/` modules. It excludes test
results, benchmark datasets, development scripts and repository metadata.

The expected project URL is `https://l3acler.github.io/Rel3c/`. Publishing requires
the workflow to be present on GitHub and Pages to use GitHub Actions as its source.
The URL is live only after a successful deployment; local build success alone does
not establish publication.

## GitHub setup

1. In [repository Pages settings](https://github.com/l3acler/Rel3c/settings/pages),
   select **GitHub Actions** under Build and deployment → Source.
2. Push the documentation/workflow to `main`, or run **Publish documentation**
   from the [Actions tab](https://github.com/l3acler/Rel3c/actions/workflows/docs.yml).
3. Wait for both build and deploy to pass. Open the deployment URL and check the
   quick start, API links and TodoMVC filters.

The workflow verifies TodoMVC actions and root startup, stages a curated source,
builds it with GitHub's Jekyll action, checks generated links under `/Rel3c`, uploads
the artifact and deploys it to the `github-pages` environment. Future pushes to
`main` repeat the process. Deployment uses GitHub's workflow token; no personal
credential belongs in the repository. Environment protection rules can require an
approval configured by the repository owner.

See GitHub's [custom Pages workflow guide](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)
and [publishing-source settings](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site).

## Local build and preview

Application startup needs only Node.js. Building these Markdown pages additionally
uses Ruby, Bundler, Jekyll 3.10.0 and jekyll-relative-links 0.7.0, declared in
[docs/Gemfile](https://github.com/l3acler/Rel3c/blob/main/docs/Gemfile). They are documentation tooling, not framework runtime
dependencies. A modern Ruby installation is recommended; the macOS system Ruby
may be too old for transitive gem dependencies.

From the repository root:

```sh
bundle install --gemfile docs/Gemfile
npm run docs:prepare
bundle exec --gemfile docs/Gemfile jekyll build --source build/pages-source --destination build/docs-site
npm run docs:check
```

Generated links intentionally use the GitHub project prefix `/Rel3c`. A local
static server must map that prefix to `build/docs-site`; the application's normal
root development server does not provide that mapping. Use the deployed site for
the actual project-path walkthrough. This build process does not alter application
startup.

`docs:prepare` recreates only `build/pages-source`; builds belong under the ignored
`build/` folder. Source Markdown stays readable on GitHub. During staging, docs
gain front matter, code examples are protected from Liquid expansion, and links
to files outside the curated site point to GitHub. `docs:check` verifies local
generated links/assets, the project prefix and the presence of public imports.

Keep `docs/_config.yml`, the staging/check scripts and deployment URL aligned if
the GitHub account, repository name or custom domain changes. Add new public pages
under `docs/`; update the homepage links in `docs/index.md`. Update the root public
guide whenever framework behavior changes. The npm package identifier and runtime
format versions remain separate from the Rel3c documentation branding.

---
title: Rel3c
permalink: /
---

# Build a browser app with Rel3c

Rel3c is a JavaScript frontend framework with its own declarative DOM, transactional
state, event handling and router. Applications run as browser modules with no
compiler, bundler or third-party runtime framework.

**[Start with TodoMVC](quickstart.md)** · **[Try the live example](../examples/todomvc/)**

The first app is a complete todo list: add, complete, edit and delete tasks; switch
between All, Active and Completed; reload to restore saved tasks. Its controls use
the familiar TodoMVC structure and locally bundled reference styles.

## Learn the framework

| Start here | What you will learn |
| --- | --- |
| [Quick start](quickstart.md) | Clone, run and customize the TodoMVC app |
| [Public guide](../DOCUMENTATION.md) | Runnable examples and the complete implemented contracts |
| [Application API](api/application.md) | Lifecycle, action schemas and state ownership |
| [Declarative DOM](api/dom.md) | Elements, attributes and explicit bindings |
| [Keyed lists](api/collections.md) | Item identity and list updates |
| [Events and native inputs](api/events.md) | Clicks, keyboard, text editing and cleanup |
| [Routing](api/routing.md) | URLs and shared application state |
| [Persistence](api/persistence.md) | Validated local/session/URL state |
| [Recording and replay](api/recording.md) | Bounded recording and deterministic continuation |

## Release status

The public API is experimental at `0.1.0`. Rel3c is the project name and
package identifier (`Rel3c`). The quick start uses the checked-out source
and does not assume an npm registry release.

Desktop Chrome automation covers the framework and TodoMVC example. Other browsers,
mobile, assistive technology and OS-level clipboard/IME behavior still need
qualification. See the [support matrix](browser-support.md) and
[release notes](../RELEASE_NOTES.md).

The framework's original code uses the [MIT License](../LICENSE). The example's
bundled styles retain their [separate upstream notices](../examples/todomvc/css/NOTICE.md).

[Publishing and maintaining these pages](publishing.md)

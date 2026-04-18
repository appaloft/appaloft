# Changelog

## [1.0.0](https://github.com/appaloft/appaloft/compare/v0.1.0...v1.0.0) (2026-04-18)


### ⚠ BREAKING CHANGES

* resources.create no longer accepts runtimeProfile.port; callers must use networkProfile.internalPort.

### Features

* **adapter-cli:** migrate to effect cli ([e5b7424](https://github.com/appaloft/appaloft/commit/e5b7424bd5c53915ade410b3fc289f2853b422b7))
* **adapters:** wire cli and runtime operations ([0f8bd9f](https://github.com/appaloft/appaloft/commit/0f8bd9f8239472a0f74d44b17d603b32e3276256))
* add acme certificate provider ([5ba6ea9](https://github.com/appaloft/appaloft/commit/5ba6ea9dd54b2fa6dbee9b35233a132587976906))
* add certificate issuance workflow ([abb2892](https://github.com/appaloft/appaloft/commit/abb28920ae9663cf86632b4fa5ab17f67b1548b9))
* add certificate retry scheduler ([1189480](https://github.com/appaloft/appaloft/commit/1189480eb9417c4ec29c95270fe6ae340c76554e))
* add cli operation progress logging ([240e0ab](https://github.com/appaloft/appaloft/commit/240e0ab53ecd765168af14f799cdaf839c08c121))
* add default access routing and edge proxy providers ([f5f3185](https://github.com/appaloft/appaloft/commit/f5f3185bcd9773d2d06927f48229e0301f8eca6b))
* add deployment console flow and ssh runtime support ([c688fc6](https://github.com/appaloft/appaloft/commit/c688fc6c723c9c26e8934ba8bfaa8aafa942fa78))
* add dns-gated domain ownership verification ([0eaf0b3](https://github.com/appaloft/appaloft/commit/0eaf0b352d0e43ec985d129ccbc9757e6c838006))
* add domain ownership confirmation and ready route projection ([9cd47ba](https://github.com/appaloft/appaloft/commit/9cd47ba0b82a2fe2e64c38d6a6b534798c26fee8))
* add edge proxy reload plans ([e905e57](https://github.com/appaloft/appaloft/commit/e905e57983294079b327bb2ab7c8351bd9e4e74c))
* add edge proxy routing support ([42ef7a9](https://github.com/appaloft/appaloft/commit/42ef7a9332aec5473e73a6fcf902ccc14f9ec801))
* add electron desktop shell ([f5bfd3f](https://github.com/appaloft/appaloft/commit/f5bfd3fdadd1cb35191e84daad82cb82722b2b6c))
* add interactive deploy flow and localized console ([2ed711c](https://github.com/appaloft/appaloft/commit/2ed711caf5eca06999a86ef42ad21c8df244f970))
* add pino backend logging ([3e0d15a](https://github.com/appaloft/appaloft/commit/3e0d15a5bb1bfea3ebf9cc8be4ec34b59e97ba16))
* add resource and destination deployment topology ([df3364d](https://github.com/appaloft/appaloft/commit/df3364d7823742eda55bd931601e60bf005bb215))
* add resource network profile to deploy flow ([cd3684a](https://github.com/appaloft/appaloft/commit/cd3684ac5e1342030eac2640ad0e5f9eed2d8713))
* add resource runtime log observation ([a3e594a](https://github.com/appaloft/appaloft/commit/a3e594afb8ae68775153587c208b982904d829fd))
* add server connectivity pages ([2ca39b4](https://github.com/appaloft/appaloft/commit/2ca39b418a30dbbb34711bb63eac987b230e8853))
* add server ssh credentials ([b82ed27](https://github.com/appaloft/appaloft/commit/b82ed272eeb6e3c5d30cfcb75f4064cc08cd912f))
* add static deployment support and release automation ([5502d69](https://github.com/appaloft/appaloft/commit/5502d690083a55b336005f3ebf708115ba6498f8))
* **application:** add health diagnostics and proxy repair operations ([173fb3f](https://github.com/appaloft/appaloft/commit/173fb3f4492f528d82e0b347c28a2385e69ea2fe))
* **application:** add resource-owned deployment operations ([1525568](https://github.com/appaloft/appaloft/commit/1525568a966d02fde9dbbe723296ef38658f69dd))
* **cli:** add resource diagnostics and proxy repair commands ([fe88b83](https://github.com/appaloft/appaloft/commit/fe88b83d1cd33023c9f0479e9fd042adcf816113))
* **config:** support repository deployment profiles ([86c4443](https://github.com/appaloft/appaloft/commit/86c4443812438120b147fd16b2294368e39d39b1))
* **core:** model resource profiles and routing state ([540666b](https://github.com/appaloft/appaloft/commit/540666b58bed576c8da23423987fa68090a33019))
* **deploy:** bootstrap deployments from yundu config ([5858b37](https://github.com/appaloft/appaloft/commit/5858b3704a0c31cf5f1a11514bcbc08b2c664394))
* **domain-bindings:** mark recovered routes ready ([e8d3cc8](https://github.com/appaloft/appaloft/commit/e8d3cc8ef99ef3df903fc32340eaf6ac60a81628))
* **examples:** add local express deployment config ([efc2d1f](https://github.com/appaloft/appaloft/commit/efc2d1f5d4d2a5852ee580460b8c26d8593af97c))
* mark domains ready after certificate issuance ([a03fe23](https://github.com/appaloft/appaloft/commit/a03fe2394791b04e5756f62c6c08d2a94a688e23))
* normalize resource source bindings ([c024def](https://github.com/appaloft/appaloft/commit/c024def403fcd94f52972a3a8769e51feec60df8))
* **observability:** add otel bootstrap and trace headers ([b0dbb40](https://github.com/appaloft/appaloft/commit/b0dbb40d6ff7321b623782a6f24d3f88c7c569ec))
* **persistence:** persist deployment platform state ([2aec727](https://github.com/appaloft/appaloft/commit/2aec72794172349e1ad78bb36d40d6068219a15f))
* **quick-deploy:** improve progress and generated names ([3e56846](https://github.com/appaloft/appaloft/commit/3e56846cb9eb28558f3da48b5c0e37510cb99eac))
* realize durable domain routes ([34bec7b](https://github.com/appaloft/appaloft/commit/34bec7b12d28a95acd669da9aac0b7ae93a459c5))
* record route realization failures ([fa30b6d](https://github.com/appaloft/appaloft/commit/fa30b6d95d5ce2e23aadbfb11c658529ef2fc4d6))
* **resources:** configure and probe health policies ([2553cf3](https://github.com/appaloft/appaloft/commit/2553cf33f92f861c118c4a57850ae0273dcba121))
* **runtime:** add docker runtime target foundations ([0a530dc](https://github.com/appaloft/appaloft/commit/0a530dc20e1d83081a8febceb96f22332ed534ad))
* **runtime:** expand framework and source metadata ([c8530c0](https://github.com/appaloft/appaloft/commit/c8530c0b42e7d95a6fa49c5bf03f673a98dc9312))
* **runtime:** improve docker health checks and proxy diagnostics ([3f2304e](https://github.com/appaloft/appaloft/commit/3f2304e0d35510c5ca07440e77972ba34260187c))
* serve http challenge tokens ([4ca5bfe](https://github.com/appaloft/appaloft/commit/4ca5bfe9e2e7374d15e2d8752dea59922020f6e1))
* support headless config deploy ([ecd0c04](https://github.com/appaloft/appaloft/commit/ecd0c04c06831828368390596e4597870a91d9bf))
* **terminal-sessions:** add operator terminal entrypoints ([032b546](https://github.com/appaloft/appaloft/commit/032b546103f424085560f67443d642ea5d5b54a1))
* **web:** add resource health and diagnostics console ([3a5b100](https://github.com/appaloft/appaloft/commit/3a5b100e52eb5f6a9007ad5eae0c6af426a7e6b2))
* **web:** add resource-owned deployment console ([5fa1f52](https://github.com/appaloft/appaloft/commit/5fa1f52cade622e1825e54853c670983e4ea3a91))
* **web:** add server creation page ([975594a](https://github.com/appaloft/appaloft/commit/975594aa93a433a4e7425db91efe90653a161cf4))
* **web:** configure resource health policies ([cc48432](https://github.com/appaloft/appaloft/commit/cc4843230b382f9e1c030d6e729859740a36b780))
* **web:** redesign console navigation and resource workflows ([684f9be](https://github.com/appaloft/appaloft/commit/684f9be085aef8e1772691f775367ebaaba3d678))
* **web:** show quick deploy progress in a dialog ([dba8703](https://github.com/appaloft/appaloft/commit/dba8703f845169b4a75097691ceb0ba2314af7ad))
* **web:** split console project and deployment views ([db5276e](https://github.com/appaloft/appaloft/commit/db5276e79141f05da8a024b2e097aa943831f69b))


### Bug Fixes

* **config:** default pglite storage to user data dir ([3d91d75](https://github.com/appaloft/appaloft/commit/3d91d75780662ee7ee6d810c8b19488a9e873b70))
* **desktop:** open external links in system browser ([e5c5893](https://github.com/appaloft/appaloft/commit/e5c58934f99062c1fc718e3c9c885709a91a3b2d))
* **runtime:** classify proxy conflicts and stream ssh output ([f3a12d9](https://github.com/appaloft/appaloft/commit/f3a12d93c3c3dffae860c769980b6051b77d050a))
* **runtime:** time out bounded runtime log reads ([a397f77](https://github.com/appaloft/appaloft/commit/a397f7788f1d203452793b2b79f1646fdf5a6076))
* **shell:** resolve local web build assets ([033979f](https://github.com/appaloft/appaloft/commit/033979fc968e5550d4c2bcd8cfd099ecb239ea3a))
* skip default access without edge proxy ([e20dbfc](https://github.com/appaloft/appaloft/commit/e20dbfc9b755cc6ed7b96ee2d63ece94730c0a74))
* **terminal:** reject source locators as workdirs ([9d7f819](https://github.com/appaloft/appaloft/commit/9d7f819cfe7efed4ce123435ba416885a01176d0))
* **web:** default server form to ssh key paste ([2011d55](https://github.com/appaloft/appaloft/commit/2011d5557dfaf695aacf84ef8d47212772da2368))
* **web:** stream deployment progress over sse ([3155bc4](https://github.com/appaloft/appaloft/commit/3155bc45a781a2d9eeef0f40b254626fa2b798d1))
* wire deployment list cli and sign binary bundle ([87856b7](https://github.com/appaloft/appaloft/commit/87856b7f89b3c40d7a57afdbfcffed377fb403da))


### Documentation

* align resource-first deployment contracts ([bec035a](https://github.com/appaloft/appaloft/commit/bec035a54b5e75f56b23c6c19f9353cb41248516))
* codify runtime substrate and terminal contracts ([1027c01](https://github.com/appaloft/appaloft/commit/1027c017ba102f84f66ee11476173b22f96c4360))
* define spec-driven platform contracts ([e988434](https://github.com/appaloft/appaloft/commit/e988434ae47ffc838179e1e16ec256708ceb5c32))
* specify resource health and diagnostics ([a1f9610](https://github.com/appaloft/appaloft/commit/a1f9610543c0f6dc439f9fce0dbadba19b7ef435))
* update deployment workflow specs ([8f7c8e0](https://github.com/appaloft/appaloft/commit/8f7c8e0b0cfcbbb8922203df4f9126cb10d57811))


### Miscellaneous

* add environment action config ([1d7aa16](https://github.com/appaloft/appaloft/commit/1d7aa169d22cf7b5e6f01f88022069664099bb40))
* redesign appaloft logo ([2dbb0a8](https://github.com/appaloft/appaloft/commit/2dbb0a8899113d16328026d840e3c2873acd56f5))
* rename project to appaloft ([0678112](https://github.com/appaloft/appaloft/commit/06781124d1330c40e1ec8db652dff342048406a1))
* **shell:** update runtime composition and e2e setup ([cd7d8e1](https://github.com/appaloft/appaloft/commit/cd7d8e1cf671472e74a6d009aee22908381a1467))
* update codex env ([543cc6a](https://github.com/appaloft/appaloft/commit/543cc6a554b0c6f9e33c223418bbc858ed760a68))

## Changelog

All notable changes to this project are documented here. Release Please updates this file from Conventional Commits when it opens the release PR.

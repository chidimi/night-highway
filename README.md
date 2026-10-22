# Night Highway

一本道と周期的な道路灯の下を走る、ローカルのThree.js / TypeScript試作。

```sh
npm install
npm run dev
```

表示されたローカルURLをブラウザーで開き、「走りはじめる」を押します。↑ / Wを長押しして加速、← → / A Dで左右操作。アクセルを離すと減速します。タッチ操作にも対応。音楽はお好みのプレイヤーで流してください。

```sh
npm run lint
npm run typecheck
npm test
npm run build
```

設計の背景は [desgin.md](desgin.md)、開発方針は [AGENTS.md](AGENTS.md) を参照してください。Cloudflareへの公開手順は下記を参照してください。

## Cloudflare

Cloudflare Workers Static Assetsで `dist/` を公開します。Worker名は `night-highway`。既存の `night-flight` とは別のWorkerです。

```sh
npx wrangler login --scopes account:read user:read workers:write workers_scripts:write workers_routes:write
npm run deploy:check
npm run deploy
```

認証情報をソースに保存しないでください。現在は手動デプロイで、GitHubへのpushからの自動デプロイは設定していません。

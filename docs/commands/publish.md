# publish

Build output/feed.xml from the newest digests (optionally one topic only).

**External dependencies:** none

## Config

| field | type | default |
|---|---|---|
| title | str | 'Trendly' |
| link | str | 'http://localhost:8100' |
| max_items | int | 50 |

## Params

| field | type | default |
|---|---|---|
| topic | str | '' |

## Input

*(none)*

## Output

| field | type | default |
|---|---|---|
| path | str | required |
| items | int | required |

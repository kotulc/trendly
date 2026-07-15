# search

Query SearXNG for fresh results; input is a topic name or explicit queries.

**External dependencies:** searxng

## Config

| field | type | default |
|---|---|---|
| categories | str | 'news' |
| time_range | str | 'week' |
| top_n | int | 20 |
| timeout | float | 15.0 |

## Params

| field | type | default |
|---|---|---|
| top_n | int | 0 |
| time_range | str | '' |

## Input

| field | type | default |
|---|---|---|
| topic | str | '' |
| queries | list | [] |

## Output

| field | type | default |
|---|---|---|
| results | list | required |

# extract

Turn urls (or piped search results) into markdown articles.

**External dependencies:** none

## Config

| field | type | default |
|---|---|---|
| min_length | int | 400 |
| timeout | float | 20.0 |
| fallback | bool | True |

## Params

*(none)*

## Input

| field | type | default |
|---|---|---|
| urls | list | [] |
| results | list | [] |

## Output

| field | type | default |
|---|---|---|
| articles | list | required |
| failed | list | required |

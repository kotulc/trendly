# run

Run every pipeline stage in-process for one topic and log the outcome.

**External dependencies:** searxng, taggly, llm

## Config

| field | type | default |
|---|---|---|
| query_model | str | '' |
| query_count | int | 5 |

## Params

| field | type | default |
|---|---|---|
| dry_run | bool | False |

## Input

| field | type | default |
|---|---|---|
| topic | str | required |

## Output

| field | type | default |
|---|---|---|
| topic | str | required |
| found | int | required |
| new | int | required |
| extracted | int | required |
| kept | int | required |
| paths | list | required |

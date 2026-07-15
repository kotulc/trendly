# judge

Filter articles below the topic's min_score, then llm-judge and summarize the rest.

**External dependencies:** llm

## Config

| field | type | default |
|---|---|---|
| model | str | '' |
| max_articles | int | 25 |

## Params

| field | type | default |
|---|---|---|
| topic | str | '' |

## Input

| field | type | default |
|---|---|---|
| articles | list | required |

## Output

| field | type | default |
|---|---|---|
| articles | list | required |
| rejected | list | required |

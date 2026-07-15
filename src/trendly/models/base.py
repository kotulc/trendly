"""Abstract base command: typed Config/Params/Input/Output contracts, mirroring Taggly."""

from abc import ABC, abstractmethod

from pydantic import BaseModel


class EmptyModel(BaseModel):
    """Default contract for commands that take no config, params, or input."""


class AbstractBaseCommand(ABC):
    """One pipeline stage: auto-registered as a CLI subcommand, API endpoint, and docs page."""

    name: str = ""
    requires: list[str] = []

    Config: type[BaseModel] = EmptyModel
    Params: type[BaseModel] = EmptyModel
    Input: type[BaseModel] = EmptyModel
    Output: type[BaseModel] = EmptyModel

    def __init__(self, config: BaseModel = None, **kwargs):
        self.config = config or self.Config(**kwargs)

    def __call__(self, data: BaseModel = None, params: BaseModel = None) -> BaseModel:
        return self.operation(data or self.Input(), params or self.Params())

    @abstractmethod
    def operation(self, data: BaseModel, params: BaseModel) -> BaseModel:
        """Execute the command against validated input and per-call params."""

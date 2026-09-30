import math
from typing import Any

from flask import Request
from flask.typing import ResponseReturnValue
from marshmallow import Schema
from sqlalchemy import func
from sqlalchemy.orm import Query

from tsh.database import db


def paginate(
    query: Query,
    request: Request,
    schema: Schema,
    key: str,
    /,
    default_page_size: int = 10,
    max_page_size: int = 100,
) -> ResponseReturnValue | None:
    """
    Paginate a query

    Args:
        query:
        request:
        schema:
        key:
        default_page_size:
        max_page_size:

    Returns:
        On a success, returns a dictionary representing the JSON response containing the following fields:
          - items: the items of the query
          - [key]: alias for items
          - total: the total number of items in the query
          - page: the current page
          - pageSize: the current page size
          - page_size: alias for pageSize
          - totalPages: the total number of pages in the query, given the pageSize
          - total_pages: alias for totalPages

        If the request doesn't contain a page parameter, returns None.

        On an error, returns a dictionary containing an error key that contains a string representing the error, along with an error code.
    """
    page_param = request.args.get("page")
    page_size_param = (
        request.args.get("pageSize")
        or request.args.get("page_size")
        or request.args.get("per_page")
    )

    if page_param is None:
        return None

    page = validate_page(page_param)
    if not isinstance(page, int):
        return page

    page_size = validate_page_size(
        page_size_param, default=default_page_size, max=max_page_size
    )
    if not isinstance(page_size, int):
        return page_size

    total_items, total_pages = count_query_totals(query, page_size)
    items = get_query_page(query, schema, page, page_size, total_pages)

    return {
        "items": items,
        key: items,
        "total": total_items,
        "page": page,
        "pageSize": page_size,
        "page_size": page_size,
        "totalPages": total_pages,
        "total_pages": total_pages,
    }


def get_query_page(
    query: Query, schema: Schema, page: int, page_size: int, total_pages: int
) -> list[Any]:
    """
    Get the items for the current page of a query.

    Args:
        query: The query to pull the items from.
        schema: The schema to deserialize the items with.
        page: The current page.
        page_size: The size of each page.
        total_pages: The total number of pages in the query.

    Returns:
        A list of the items in the query for the current page, deserialized with the schema.
    """
    if total_pages == 0 or page > total_pages:
        paged_items = []
    else:
        offset = (page - 1) * page_size
        paged_items = (
            db.session.execute(query.limit(page_size).offset(offset)).scalars().all()
        )
    items = schema.dump(paged_items)
    return items


def count_query_totals(query: Query, page_size: int) -> tuple[int, int]:
    """
    Count the total items and pages for a query.

    Args:
        query: The query to pull the count from.
        page_size: The page size to use.

    Returns:
        The total items and pages the query will contain, given the page_size.
    """
    count_query = db.select(func.count()).select_from(query.order_by(None).subquery())
    total_items = db.session.scalar(count_query) or 0
    total_pages = math.ceil(total_items / page_size) if total_items > 0 else 0
    return total_items, total_pages


def validate_page(page_param: str) -> int | ResponseReturnValue:
    """
    Validate the page parameter of a paginated query.

    Args:
        page_param: The page parameter from the query.

    Returns:
        The page on success, or an error Response if the parameter is invalid.
    """
    try:
        page = int(page_param)
        if page < 1:
            return {
                "error": "Page must be a positive integer",
                "message": "Page must be a positive integer",
            }, 400
        return page
    except (ValueError, TypeError):
        return {
            "error": "Invalid page parameter",
            "message": "Invalid page parameter",
        }, 400


def validate_page_size(
    page_size_param: str | None, default: int, max: int
) -> int | ResponseReturnValue:
    """
    Validate the page size parameter of a paginated query.

    Args:
        page_size_param: The page size parameter from the query.
        default: The default page size to use if page_size_param is None.
        max: The max page size to allow.

    Returns:
        The page size on success, or an error Response if the parameter is invalid.
    """
    if page_size_param is None:
        return default
    try:
        page_size = int(page_size_param)
        if page_size < 1:
            return {
                "error": "Page size must be an integer greater than or equal to 1",
                "message": "Page size must be an integer greater than or equal to 1",
            }, 400
        return min(page_size, max)
    except (ValueError, TypeError):
        return {
            "error": "Invalid page size parameter",
            "message": "Invalid page size parameter",
        }, 400

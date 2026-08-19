import React from "react";
import { useIsMobile } from "../hooks/useMediaQuery";

// Columns opt into a card role with an optional `mobile` field:
//   "title" | "subtitle" | "meta" | "hide"
// Anything left unannotated falls back to a default, so a page that has never
// heard of the card view still gets a usable one: the first column becomes the
// title and the rest become meta rows. The default title is suppressed when a
// column claims that role explicitly, so an annotated table cannot end up with
// two titles competing.
function resolveRoles(columns) {
  const hasExplicitTitle = columns.some((column) => column.mobile === "title");
  return columns.map((column, index) => {
    if (column.mobile) return column.mobile;
    return index === 0 && !hasExplicitTitle ? "title" : "meta";
  });
}

function cellValue(column, row) {
  return column.render ? column.render(row) : row[column.key];
}

function TableCards({
  columns,
  rows,
  getRowKey,
  onRowClick,
  getGroupKey,
  renderGroupHeader,
  sort,
  onSortChange,
}) {
  const roles = resolveRoles(columns);
  const titleColumn = columns.find((_, i) => roles[i] === "title");
  const subtitleColumn = columns.find((_, i) => roles[i] === "subtitle");
  const metaColumns = columns.filter((_, i) => roles[i] === "meta");
  const sortableColumns = columns.filter((column) => column.sortable);
  const showSort = Boolean(sortableColumns.length && onSortChange);

  // The header click cycle ends on onSortChange(null), so the select needs an
  // explicit way back to unsorted or that state becomes unreachable on a phone.
  const sortValue = sort?.key ? `${sort.key}:${sort.direction}` : "";

  function handleSortChange(event) {
    const raw = event.target.value;
    if (!raw) {
      onSortChange(null);
      return;
    }
    const [key, direction] = raw.split(":");
    onSortChange({ key, direction });
  }

  let previousGroupKey;

  return (
    <div className="table-cards-wrap">
      {showSort ? (
        <div className="table-cards-sort">
          <label htmlFor="table-cards-sort-select">Sort</label>
          <select
            className="select"
            id="table-cards-sort-select"
            onChange={handleSortChange}
            value={sortValue}
          >
            <option value="">Default order</option>
            {sortableColumns.map((column) => (
              <React.Fragment key={column.key}>
                <option value={`${column.key}:asc`}>{column.header} (A–Z)</option>
                <option value={`${column.key}:desc`}>{column.header} (Z–A)</option>
              </React.Fragment>
            ))}
          </select>
        </div>
      ) : null}

      <ul className="table-cards">
        {rows.map((row) => {
          const rowKey = getRowKey(row);
          const groupKey = getGroupKey ? getGroupKey(row) : undefined;
          const showGroup = getGroupKey && groupKey !== previousGroupKey;
          previousGroupKey = groupKey;

          const tappable = Boolean(onRowClick);
          const interaction = tappable
            ? {
                role: "button",
                tabIndex: 0,
                onClick: () => onRowClick(row),
                onKeyDown: (event) => {
                  if (event.key !== "Enter" && event.key !== " ") return;
                  event.preventDefault();
                  onRowClick(row);
                },
              }
            : {};

          return (
            <React.Fragment key={rowKey}>
              {showGroup ? (
                <li className="table-card-group">
                  {renderGroupHeader ? renderGroupHeader(groupKey, row) : groupKey}
                </li>
              ) : null}
              <li>
                <div className={`table-card ${tappable ? "tappable" : ""}`} {...interaction}>
                  {titleColumn ? (
                    <div className="table-card-title">{cellValue(titleColumn, row)}</div>
                  ) : null}
                  {subtitleColumn ? (
                    <div className="table-card-subtitle">{cellValue(subtitleColumn, row)}</div>
                  ) : null}
                  {metaColumns.length ? (
                    <dl className="table-card-meta">
                      {metaColumns.map((column) => (
                        <React.Fragment key={column.key}>
                          <dt>{column.header}</dt>
                          <dd>{cellValue(column, row)}</dd>
                        </React.Fragment>
                      ))}
                    </dl>
                  ) : null}
                </div>
              </li>
            </React.Fragment>
          );
        })}
      </ul>
    </div>
  );
}

export default function Table(props) {
  const {
    columns,
    rows,
    getRowKey,
    onRowClick,
    getGroupKey,
    renderGroupHeader,
    sort,
    onSortChange,
  } = props;
  const isMobile = useIsMobile();

  let previousGroupKey;

  function handleHeaderClick(column) {
    if (!column.sortable || !onSortChange) return;
    const currentKey = sort?.key;
    const currentDir = sort?.direction;
    if (currentKey !== column.key) {
      onSortChange({ key: column.key, direction: column.defaultDirection || "asc" });
      return;
    }
    if (currentDir === "asc") {
      onSortChange({ key: column.key, direction: "desc" });
      return;
    }
    onSortChange(null);
  }

  function sortIndicator(column) {
    if (!column.sortable) return null;
    const active = sort?.key === column.key;
    const dir = active ? sort.direction : null;
    return (
      <span className={`th-sort ${active ? "active" : ""}`} aria-hidden="true">
        {dir === "asc" ? "▲" : dir === "desc" ? "▼" : "↕"}
      </span>
    );
  }

  if (isMobile) return <TableCards {...props} />;

  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            {columns.map((column) => {
              const sortable = Boolean(column.sortable && onSortChange);
              const ariaSort =
                sortable && sort?.key === column.key
                  ? sort.direction === "asc" ? "ascending" : "descending"
                  : sortable ? "none" : undefined;
              return (
                <th
                  key={column.key}
                  aria-sort={ariaSort}
                  className={sortable ? "th-sortable" : ""}
                  onClick={sortable ? () => handleHeaderClick(column) : undefined}
                >
                  <span className="th-label">{column.header}</span>
                  {sortIndicator(column)}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const rowKey = getRowKey(row);
            const groupKey = getGroupKey ? getGroupKey(row) : undefined;
            const showGroup = getGroupKey && groupKey !== previousGroupKey;
            previousGroupKey = groupKey;

            return (
              <React.Fragment key={rowKey}>
                {showGroup ? (
                  <tr className="table-group-row">
                    <td colSpan={columns.length}>
                      <span>{renderGroupHeader ? renderGroupHeader(groupKey, row) : groupKey}</span>
                    </td>
                  </tr>
                ) : null}
                <tr
                  className={onRowClick ? "row-link" : ""}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                >
                  {columns.map((column) => (
                    <td key={column.key}>{column.render ? column.render(row) : row[column.key]}</td>
                  ))}
                </tr>
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

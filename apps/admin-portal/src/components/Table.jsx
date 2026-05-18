import React from "react";

export default function Table({
  columns,
  rows,
  getRowKey,
  onRowClick,
  getGroupKey,
  renderGroupHeader,
  sort,
  onSortChange,
}) {
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

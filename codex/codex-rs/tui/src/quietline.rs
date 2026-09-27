//! Quietline presentation, derived from the native TUI's session state.
//! No backend operations or independent agent lifecycle live in these widgets.

use crate::render::renderable::Renderable;
use crate::style;
use crate::style::StatusTone;
use crate::text_formatting::center_truncate_path;
use crate::text_formatting::truncate_text;
use codex_protocol::ThreadId;
use ratatui::buffer::Buffer;
use ratatui::layout::Alignment;
use ratatui::layout::Position;
use ratatui::layout::Rect;
use ratatui::style::Styled;
use ratatui::style::Stylize;
use ratatui::text::Line;
use ratatui::widgets::Paragraph;
use ratatui::widgets::Widget;
use std::cell::Cell;
use std::ops::Range;

pub(crate) fn startup_lines(
    cell: &dyn crate::history_cell::HistoryCell,
    width: u16,
) -> Vec<Line<'static>> {
    if cell
        .as_any()
        .is::<crate::history_cell::SessionHeaderHistoryCell>()
    {
        Vec::new()
    } else if let Some(info) = cell
        .as_any()
        .downcast_ref::<crate::history_cell::SessionInfoCell>()
    {
        info.startup_notice_lines(width)
    } else {
        cell.display_lines(width)
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct AgentRow {
    pub(crate) thread_id: ThreadId,
    pub(crate) label: String,
    pub(crate) running: bool,
    pub(crate) closed: bool,
    pub(crate) selected: bool,
}

#[derive(Default)]
pub(crate) struct AgentStrip {
    rows: Vec<AgentRow>,
    hovered: Option<ThreadId>,
    rendered_area: Cell<Rect>,
}

impl AgentStrip {
    pub(crate) fn set_rows(&mut self, rows: Vec<AgentRow>) -> bool {
        if self.rows == rows {
            return false;
        }
        self.rows = rows;
        if !self
            .hovered
            .is_some_and(|thread_id| self.rows.iter().any(|row| row.thread_id == thread_id))
        {
            self.hovered = None;
        }
        true
    }

    pub(crate) fn is_empty(&self) -> bool {
        self.rows.is_empty()
    }

    fn visible_range(&self) -> Range<usize> {
        let count = self.rows.len().min(4);
        if count == 0 {
            return 0..0;
        }
        let selected = self
            .rows
            .iter()
            .position(|row| row.selected)
            .or_else(|| self.rows.iter().position(|row| row.running && !row.closed))
            .unwrap_or(0);
        let first = selected.saturating_sub(count - 1);
        first..first + count
    }

    pub(crate) fn agent_at(&self, position: Position) -> Option<ThreadId> {
        let area = self.rendered_area.get();
        if area.width < 16 || !area.contains(position) {
            return None;
        }
        let range = self.visible_range();
        let index = range.start + usize::from(position.y - area.y);
        (index < range.end).then(|| self.rows[index].thread_id)
    }

    pub(crate) fn set_hovered(&mut self, position: Option<Position>) -> bool {
        let hovered = position.and_then(|position| self.agent_at(position));
        if self.hovered == hovered {
            return false;
        }
        self.hovered = hovered;
        true
    }

    fn lines(&self, width: u16) -> Vec<Line<'static>> {
        if self.rows.is_empty() || width < 16 {
            return Vec::new();
        }
        let range = self.visible_range();
        let first = range.start;
        let count = range.len();
        let mut lines = Vec::new();
        for row in &self.rows[range] {
            let hovered = self.hovered == Some(row.thread_id);
            let marker = if row.selected {
                "› "
            } else if hovered {
                "→ "
            } else {
                "  "
            };
            let (status, status_style) = if row.closed {
                ("closed", style::secondary_text_style())
            } else if row.running {
                ("working", style::status_style(StatusTone::Success))
            } else {
                ("idle", style::secondary_text_style())
            };
            let label = center_truncate_path(&row.label, usize::from(width.saturating_sub(14)));
            lines.push(Line::from(vec![
                marker.set_style(style::accent_style()),
                label.set_style(if row.selected && hovered {
                    style::accent_style().bold().underlined()
                } else if row.selected {
                    style::accent_style().bold()
                } else if hovered {
                    style::accent_style().underlined()
                } else {
                    style::secondary_text_style()
                }),
                " · ".set_style(style::secondary_text_style()),
                status.set_style(status_style),
            ]));
        }
        let hint = if self.rows.len() > count && width < 40 {
            format!(
                "  {}–{}/{} · Alt+↑/↓",
                first + 1,
                first + count,
                self.rows.len()
            )
        } else if self.rows.len() > count {
            format!(
                "  {}–{} / {} agents · Alt+↑/↓ · /subagents",
                first + 1,
                first + count,
                self.rows.len()
            )
        } else {
            "  Alt+↑/↓ switch · /subagents".to_string()
        };
        lines.push(
            Line::from(truncate_text(&hint, usize::from(width)))
                .style(style::secondary_text_style()),
        );
        lines
    }
}

impl Renderable for AgentStrip {
    fn render(&self, area: Rect, buffer: &mut Buffer) {
        self.rendered_area.set(area);
        Paragraph::new(self.lines(area.width)).render(area, buffer);
    }

    fn desired_height(&self, width: u16) -> u16 {
        self.lines(width).len() as u16
    }
}

/// A static mark honors reduced-motion preferences and never enters chat history.
pub(crate) fn render_welcome(area: Rect, buffer: &mut Buffer) {
    let mut lines = vec![
        Line::from("╭─────╮".set_style(style::accent_style())),
        Line::from("│  q  │".set_style(style::accent_style())),
        Line::from("╰──╮  │".set_style(style::accent_style())),
        Line::from("   ╰──╯".set_style(style::accent_style())),
        Line::from("quietline".bold()),
        Line::from(""),
        Line::from("Your Codex. Everything in view.".set_style(style::secondary_text_style())),
        Line::from("/ commands · Alt+↑/↓ agents".set_style(style::secondary_text_style())),
    ];
    if area.height < 10 {
        lines.drain(0..4);
    }
    let height = lines.len().min(usize::from(area.height)) as u16;
    let centered = Rect::new(
        area.x,
        area.y + area.height.saturating_sub(height) / 2,
        area.width,
        height,
    );
    Paragraph::new(lines)
        .alignment(Alignment::Center)
        .render(centered, buffer);
}

#[cfg(test)]
#[path = "quietline_tests.rs"]
mod tests;

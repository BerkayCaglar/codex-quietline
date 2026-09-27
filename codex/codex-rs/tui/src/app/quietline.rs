//! Native navigation and fresh-screen integration for Quietline.

use super::*;
use crate::empty_state_animation::Presentation;
use crate::motion::MotionMode;
use crate::quietline::AgentRow;
use crossterm::event::MouseButton;
use crossterm::event::MouseEventKind;
use ratatui::layout::Position;
use ratatui::widgets::Widget;

impl App {
    /// Derive presentation on every draw so late picker and liveness updates cannot go stale.
    pub(super) fn sync_quietline_agents(&mut self) {
        let active = self.current_displayed_thread_id();
        let rows = self
            .agent_navigation
            .ordered_threads()
            .into_iter()
            .filter(|(id, _)| Some(*id) != self.primary_thread_id)
            .map(|(id, entry)| AgentRow {
                thread_id: id,
                label: entry
                    .agent_path
                    .as_deref()
                    .map(|path| path.trim_start_matches("/root/").to_string())
                    .unwrap_or_else(|| {
                        crate::multi_agents::format_agent_picker_item_name(
                            entry.agent_nickname.as_deref(),
                            entry.agent_role.as_deref(),
                            /*is_primary*/ false,
                        )
                    }),
                running: entry.is_running,
                closed: entry.is_closed,
                selected: Some(id) == active,
            })
            .collect();
        self.chat_widget.set_quietline_agents(rows);
    }

    pub(super) async fn handle_quietline_pointer_event(
        &mut self,
        tui: &mut tui::Tui,
        app_server: &mut AppServerSession,
        event: &TuiEvent,
    ) -> Result<bool> {
        if !tui.is_owned_screen()
            || self.overlay.is_some()
            || !self.chat_widget.no_modal_or_popup_active()
        {
            self.chat_widget.set_quietline_hovered(None);
            return Ok(false);
        }
        let TuiEvent::Mouse(mouse) = event else {
            if matches!(event, TuiEvent::FocusLost) {
                self.chat_widget.set_quietline_hovered(None);
            }
            return Ok(false);
        };
        let position = Position::new(mouse.column, mouse.row);
        if matches!(
            mouse.kind,
            MouseEventKind::Moved | MouseEventKind::Down(MouseButton::Left)
        ) {
            self.chat_widget.set_quietline_hovered(Some(position));
        }
        if mouse.kind == MouseEventKind::Down(MouseButton::Left)
            && let Some(thread_id) = self.chat_widget.quietline_agent_at(position)
        {
            if self.current_displayed_thread_id() != Some(thread_id) {
                let _ = self
                    .select_agent_thread_and_discard_side(tui, app_server, thread_id)
                    .await;
            }
            return Ok(true);
        }
        Ok(false)
    }

    /// Use the native freshness latch; submitting, resuming, and modal ownership keep their rules.
    pub(super) fn quietline_startup_content(
        &self,
        width: u16,
    ) -> Option<Vec<ratatui::text::Line<'static>>> {
        let presentation =
            self.empty_state_presentation(MotionMode::Animated, /*focused*/ true);
        if presentation == Presentation::Hidden
            || !self
                .chat_widget
                .empty_state_animation
                .borrow()
                .is_eligible()
        {
            return None;
        }
        Some(
            self.transcript_cells
                .iter()
                .flat_map(|cell| crate::quietline::startup_lines(cell.as_ref(), width))
                .chain(self.chat_widget.quietline_startup_lines(width))
                .collect(),
        )
    }

    pub(super) fn render_quietline_welcome(
        &mut self,
        tui: &mut tui::Tui,
        size: Size,
    ) -> Result<Option<Rect>> {
        let Some(warnings) = self.quietline_startup_content(size.width) else {
            return Ok(None);
        };
        let bottom = self.chat_widget.bottom_pane_renderable(
            /*footer*/ None,
            crate::bottom_pane::CommandPopupPlacement::AboveComposer,
            /*composer_gap*/ None,
        );
        let bottom_height = bottom.desired_height(size.width).min(size.height);
        let available = size.height.saturating_sub(bottom_height);
        // Preserve startup warnings/notices while the native footer owns model/context metadata.
        let warning_height = warnings.len().min(usize::from(available)) as u16;
        if available.saturating_sub(warning_height) < 4 {
            return Ok(None);
        }
        let mut rendered = Rect::default();
        tui.draw_with_resize_reflow(size.height, size, |frame| {
            let area = frame.area();
            rendered = area;
            ratatui::widgets::Clear.render(area, frame.buffer);
            let warning_area = Rect::new(area.x, area.y, area.width, warning_height);
            ratatui::widgets::Paragraph::new(warnings).render(warning_area, frame.buffer);
            crate::quietline::render_welcome(
                Rect::new(
                    area.x,
                    area.y + warning_height,
                    area.width,
                    available - warning_height,
                ),
                frame.buffer,
            );
            let bottom_area = Rect::new(area.x, area.y + available, area.width, bottom_height);
            bottom.render(bottom_area, frame.buffer);
            self.chat_widget.note_rendered_width(area.width);
            if let Some((x, y)) = bottom.cursor_pos(bottom_area) {
                frame.set_cursor_style(bottom.cursor_style(bottom_area));
                frame.set_cursor_position((x, y));
            }
        })?;
        Ok(Some(rendered))
    }
}

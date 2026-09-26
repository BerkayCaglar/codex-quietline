// Modified for Codex Quietline: native presentation and distribution integration.
//! Gate decoration on startup-only live content and an ordinary, locally editable composer.
//! Content eligibility is latched off independently of temporary view ownership.

use super::*;
use crate::empty_state_animation::ComposerState;
use crate::empty_state_animation::is_startup_cell;

impl ChatWidget {
    pub(crate) fn quietline_startup_lines(&self, width: u16) -> Vec<ratatui::text::Line<'static>> {
        self.transcript
            .active_cell
            .as_deref()
            .into_iter()
            .flat_map(|cell| crate::quietline::startup_lines(cell, width))
            .collect()
    }

    pub(crate) fn empty_state_composer(&self) -> Option<ComposerState> {
        let startup_only = self
            .transcript
            .active_cell
            .as_deref()
            .into_iter()
            .chain(
                self.realtime_conversation
                    .pending_history_cells
                    .iter()
                    .chain(self.realtime_conversation.live_transcript_cells())
                    .map(AsRef::as_ref),
            )
            .all(is_startup_cell);
        if !startup_only
            || self.is_user_turn_pending_or_running()
            || self.initial_user_message.is_some()
        {
            self.empty_state_animation.borrow_mut().dismiss();
        }
        match self.external_editor_state {
            ExternalEditorState::Requested | ExternalEditorState::Active => None,
            ExternalEditorState::Closed if !self.external_writer_view => {
                self.bottom_pane.empty_state_composer()
            }
            ExternalEditorState::Closed => None,
        }
    }
}

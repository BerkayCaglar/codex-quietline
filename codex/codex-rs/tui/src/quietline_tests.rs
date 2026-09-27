use super::*;
use insta::assert_snapshot;
use pretty_assertions::assert_eq;

fn text(buffer: &Buffer) -> String {
    buffer
        .content
        .chunks(usize::from(buffer.area.width))
        .map(|row| {
            row.iter()
                .map(ratatui::buffer::Cell::symbol)
                .collect::<String>()
                .trim_end()
                .to_string()
        })
        .collect::<Vec<_>>()
        .join("\n")
}

#[test]
fn quietline_welcome_centers_at_terminal_sizes() {
    for (width, height) in [(40, 16), (80, 24), (120, 40)] {
        let area = Rect::new(/*x*/ 0, /*y*/ 0, width, height);
        let mut buffer = Buffer::empty(area);
        render_welcome(area, &mut buffer);
        assert_snapshot!(format!("quietline_welcome_{width}x{height}"), text(&buffer));
    }
}

#[test]
fn quietline_strip_keeps_selected_agent_visible_without_a_main_row() {
    let mut strip = AgentStrip::default();
    strip.set_rows(
        (0..7)
            .map(|index| AgentRow {
                thread_id: ThreadId::new(),
                label: format!("review/task_{index}"),
                running: index == 6,
                closed: index == 3,
                selected: index == 6,
            })
            .collect(),
    );
    for width in [28, 80] {
        let area = Rect::new(
            /*x*/ 0,
            /*y*/ 0,
            width,
            strip.desired_height(width),
        );
        let mut buffer = Buffer::empty(area);
        strip.render(area, &mut buffer);
        assert_snapshot!(format!("quietline_agents_{width}"), text(&buffer));
    }
    strip.set_rows(Vec::new());
    assert_eq!(strip.desired_height(/*width*/ 80), 0);
}

#[test]
fn quietline_strip_hover_and_hit_testing_follow_the_rendered_rows() {
    let thread_ids: Vec<_> = (0..7).map(|_| ThreadId::new()).collect();
    let mut strip = AgentStrip::default();
    strip.set_rows(
        thread_ids
            .iter()
            .enumerate()
            .map(|(index, thread_id)| AgentRow {
                thread_id: *thread_id,
                label: format!("task_{index}"),
                running: false,
                closed: false,
                selected: index == 6,
            })
            .collect(),
    );
    let area = Rect::new(
        /*x*/ 2,
        /*y*/ 3,
        /*width*/ 80,
        strip.desired_height(80),
    );
    let mut buffer = Buffer::empty(Rect::new(
        /*x*/ 0, /*y*/ 0, /*width*/ 84, /*height*/ 10,
    ));
    strip.render(area, &mut buffer);

    assert_eq!(
        strip.agent_at(ratatui::layout::Position::new(2, 3)),
        Some(thread_ids[3])
    );
    assert_eq!(
        strip.agent_at(ratatui::layout::Position::new(81, 6)),
        Some(thread_ids[6])
    );
    assert_eq!(strip.agent_at(ratatui::layout::Position::new(2, 7)), None);
    assert_eq!(strip.agent_at(ratatui::layout::Position::new(1, 4)), None);
    assert!(strip.set_hovered(Some(ratatui::layout::Position::new(4, 4))));
    assert!(!strip.set_hovered(Some(ratatui::layout::Position::new(4, 4))));

    strip.render(area, &mut buffer);
    assert_snapshot!("quietline_agents_hover", text(&buffer));
    assert!(strip.set_hovered(None));
    assert!(!strip.set_hovered(None));
}

#[test]
fn quietline_shortcuts_reuse_native_navigation() {
    use crossterm::event::KeyCode;
    use crossterm::event::KeyEvent;
    use crossterm::event::KeyModifiers;
    assert!(crate::multi_agents::previous_agent_shortcut_matches(
        KeyEvent::new(KeyCode::Up, KeyModifiers::ALT),
        /*allow_word_motion_fallback*/ false,
    ));
    assert!(crate::multi_agents::next_agent_shortcut_matches(
        KeyEvent::new(KeyCode::Down, KeyModifiers::ALT),
        /*allow_word_motion_fallback*/ false,
    ));
    for (key, previous) in [
        (KeyCode::Left, true),
        (KeyCode::Up, true),
        (KeyCode::Right, false),
        (KeyCode::Down, false),
    ] {
        let event = KeyEvent::new(key, KeyModifiers::CONTROL);
        assert_eq!(
            crate::multi_agents::previous_agent_shortcut_matches(
                event, /*allow_word_motion_fallback*/ false,
            ),
            previous,
        );
        assert_eq!(
            crate::multi_agents::next_agent_shortcut_matches(
                event, /*allow_word_motion_fallback*/ false,
            ),
            !previous,
        );
    }
    assert!(!crate::multi_agents::next_agent_shortcut_matches(
        KeyEvent::new(KeyCode::Down, KeyModifiers::NONE),
        /*allow_word_motion_fallback*/ false,
    ));
}

#[test]
fn quietline_main_view_keeps_a_running_child_in_the_strip() {
    let mut strip = AgentStrip::default();
    strip.set_rows(
        (0..7)
            .map(|index| AgentRow {
                thread_id: ThreadId::new(),
                label: format!("task_{index}"),
                running: index == 6,
                closed: index < 6,
                selected: false,
            })
            .collect(),
    );
    let area = Rect::new(
        /*x*/ 0, /*y*/ 0, /*width*/ 80, /*height*/ 5,
    );
    let mut buffer = Buffer::empty(area);
    strip.render(area, &mut buffer);
    assert_snapshot!("quietline_main_with_running_child", text(&buffer));
}

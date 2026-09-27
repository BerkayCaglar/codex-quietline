use super::*;
use crossterm::event::MouseButton;
use crossterm::event::MouseEvent;
use crossterm::event::MouseEventKind;
use pretty_assertions::assert_eq;
use ratatui::layout::Position;

#[tokio::test]
async fn quietline_inactive_child_updates_without_an_app_draw() -> Result<()> {
    let (mut app, _events, _operations) = make_test_app_with_channels().await;
    app.primary_thread_id = Some(ThreadId::new());
    let child = ThreadId::new();
    app.thread_event_channels
        .insert(child, ThreadEventChannel::new(/*capacity*/ 4));
    app.agent_navigation
        .record_sub_agent_activity(SubAgentActivityDisplay {
            thread_id: child,
            agent_path: "/root/survey".to_string(),
            is_running_hint: false,
        });
    app.sync_quietline_agents();

    app.enqueue_thread_notification(child, turn_started_notification(child, "turn-1"))
        .await?;
    assert!(render_bottom_popup(&app.chat_widget, /*width*/ 80).contains("survey · working"));

    app.enqueue_thread_notification(
        child,
        turn_completed_notification(child, "turn-older", TurnStatus::Completed),
    )
    .await?;
    assert!(render_bottom_popup(&app.chat_widget, /*width*/ 80).contains("survey · working"));

    app.enqueue_thread_notification(
        child,
        turn_completed_notification(child, "turn-1", TurnStatus::Completed),
    )
    .await?;
    assert!(render_bottom_popup(&app.chat_widget, /*width*/ 80).contains("survey · idle"));
    Ok(())
}

#[tokio::test]
async fn quietline_click_uses_native_agent_selection_and_respects_overlays() -> Result<()> {
    let mut app = Box::pin(make_test_app()).await;
    let mut app_server = Box::pin(crate::start_embedded_app_server_for_picker(&app.config)).await?;
    let root = app_server.start_thread(&app.config).await?;
    let child = app_server.start_thread(&app.config).await?;
    let child_thread_id = child.session.thread_id;
    app.enqueue_primary_thread_session(root.session, root.turns)
        .await?;
    app.thread_event_channels.insert(
        child_thread_id,
        ThreadEventChannel::new_with_session(/*capacity*/ 4, child.session, child.turns),
    );
    app.agent_navigation.upsert(
        child_thread_id,
        Some("Scout".to_string()),
        Some("worker".to_string()),
        /*is_closed*/ false,
    );

    let mut tui = crate::tui::test_support::make_test_tui()?;
    tui.set_owned_screen(/*owned*/ true)?;
    let size = Size::new(/*width*/ 80, /*height*/ 24);
    app.chat_widget
        .insert_str("draft stays with the previous agent");
    tui.screen_size_for_event(&TuiEvent::Resize(size))?;
    let bottom = app.render_owned_transcript(&mut tui, size)?;
    let position = Position::new(/*x*/ 4, bottom.bottom() - 2);
    assert_eq!(
        app.chat_widget.quietline_agent_at(position),
        Some(child_thread_id)
    );
    let click = TuiEvent::Mouse(MouseEvent {
        kind: MouseEventKind::Down(MouseButton::Left),
        column: position.x,
        row: position.y,
        modifiers: KeyModifiers::NONE,
    });

    app.overlay = Some(Overlay::new_static_with_lines(
        vec!["Overlay".into()],
        "Overlay".to_string(),
        app.keymap.pager.clone(),
    ));
    assert!(
        !app.handle_quietline_pointer_event(&mut tui, &mut app_server, &click)
            .await?
    );
    assert_ne!(app.active_thread_id, Some(child_thread_id));
    app.overlay = None;

    app.handle_tui_event(&mut tui, &mut app_server, click)
        .await?;
    assert_eq!(app.active_thread_id, Some(child_thread_id));
    tui.set_owned_screen(/*owned*/ false)?;
    Ok(())
}

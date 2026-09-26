use super::*;

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

"""Tests of components, without the API."""

import threading
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import pytest
from sqlalchemy import Engine, delete, select
from sqlalchemy.orm import Session

from compono import auth, components, projects, teams
from compono.models import Account, Component, Project, Team, default_screen_sizes

PASSWORD = "correct horse battery staple"
GRAPH: dict[str, object] = {"nodes": [{"id": "output", "type": "component-output"}]}
SIZES: list[dict[str, object]] = [{"name": "Wide", "width": 1440}]


def marketing_site(session: Session) -> Project:
    """Acme's project Marketing site, which Mira leads."""
    mira = auth.create_account(session, "Mira Kovalenko", "mira@acme.dev", PASSWORD)
    acme = teams.create_team(session, mira, "Acme", "acme")
    return projects.create_project(session, acme, mira, "Marketing site", "")


def another_project(session: Session, project: Project) -> Project:
    team = session.get_one(Team, project.team_id)
    mira = session.scalars(select(Account)).one()
    return projects.create_project(session, team, mira, "Checkout flow", "")


def names(session: Session, project: Project) -> list[str]:
    return [listed.name for listed in components.components_of(session, project)]


def test_a_new_component_is_untitled_with_an_empty_graph_and_the_default_sizes(
    session: Session,
) -> None:
    project = marketing_site(session)

    new = components.create_component(session, project, None)

    assert (new.name, new.graph, new.screen_sizes, new.version) == (
        "Untitled",
        {},
        default_screen_sizes(),
        1,
    )


def test_new_components_take_the_first_free_untitled_name(session: Session) -> None:
    project = marketing_site(session)
    for _ in range(3):
        components.create_component(session, project, None)
    second = components.component(
        session, project, components.components_of(session, project)[1].id
    )
    components.rename(session, project, second, "Header")

    components.create_component(session, project, None)

    assert sorted(names(session, project)) == [
        "Header",
        "Untitled",
        "Untitled2",
        "Untitled3",
    ]


def test_a_name_is_unique_in_a_project_ignoring_case(session: Session) -> None:
    project = marketing_site(session)
    components.create_component(session, project, "PricingCard")

    with pytest.raises(components.NameTaken):
        components.create_component(session, project, "PRICINGCARD")

    # The transaction goes on after a taken name
    components.create_component(session, project, "NavBar")
    # And another project can have the name
    components.create_component(
        session, another_project(session, project), "PricingCard"
    )


def test_renaming_a_component(session: Session) -> None:
    project = marketing_site(session)
    card = components.create_component(session, project, "PricingCard")
    components.create_component(session, project, "NavBar")

    components.rename(session, project, card, "Pricingcard")
    assert card.name == "Pricingcard"

    with pytest.raises(components.NameTaken):
        components.rename(session, project, card, "Navbar")
    assert card.name == "Pricingcard"


def test_a_copy_is_named_after_the_original_with_its_graph_and_sizes(
    session: Session,
) -> None:
    project = marketing_site(session)
    grid = components.create_component(session, project, "FeatureGrid")
    components.save(session, project, grid.id, 1, GRAPH, SIZES)
    session.refresh(grid)

    first = components.duplicate(session, project, grid)
    second = components.duplicate(session, project, grid)

    assert (first.name, second.name) == ("FeatureGridCopy", "FeatureGridCopy2")
    for copy in [first, second]:
        assert copy.id != grid.id
        assert (copy.graph, copy.screen_sizes, copy.version) == (GRAPH, SIZES, 1)


def test_a_copy_of_the_longest_name_still_fits(session: Session) -> None:
    project = marketing_site(session)
    longest = components.create_component(session, project, "A" * 64)

    first = components.duplicate(session, project, longest)
    second = components.duplicate(session, project, longest)

    assert (first.name, second.name) == ("A" * 60 + "Copy", "A" * 59 + "Copy2")


def test_saving_moves_the_version_on(session: Session) -> None:
    project = marketing_site(session)
    card = components.create_component(session, project, "PricingCard")
    yesterday = datetime.now(UTC) - timedelta(days=1)
    card.updated_at = yesterday
    session.flush()

    saved = components.save(session, project, card.id, 1, GRAPH, SIZES)

    assert saved.version == 2
    assert saved.updated_at > yesterday
    session.refresh(card)
    assert (card.graph, card.screen_sizes, card.version) == (GRAPH, SIZES, 2)
    assert components.save(session, project, card.id, 2, {}, SIZES).version == 3


def test_a_save_from_an_old_version_is_a_conflict(session: Session) -> None:
    project = marketing_site(session)
    card = components.create_component(session, project, "PricingCard")
    # Two people opened version 1, and the first saves
    components.save(session, project, card.id, 1, GRAPH, SIZES)

    with pytest.raises(components.VersionConflict):
        components.save(session, project, card.id, 1, {"nodes": []}, SIZES)

    session.refresh(card)
    assert (card.graph, card.version) == (GRAPH, 2)


def test_only_the_projects_components_are_found(session: Session) -> None:
    project = marketing_site(session)
    other = components.create_component(
        session, another_project(session, project), "PricingCard"
    )
    deleted = components.create_component(session, project, "NavBar")
    components.delete_component(session, project, deleted)

    for component_id in [other.id, deleted.id, uuid4()]:
        with pytest.raises(components.ComponentNotFound):
            components.component(session, project, component_id)
        with pytest.raises(components.ComponentNotFound):
            components.save(session, project, component_id, 1, GRAPH, SIZES)


def test_a_projects_components_are_in_the_order_they_were_created(
    session: Session,
) -> None:
    project = marketing_site(session)
    components.create_component(session, another_project(session, project), "Footer")
    created = [
        components.create_component(session, project, name)
        for name in ["PricingCard", "NavBar", "Hero"]
    ]
    now = datetime.now(UTC)
    for minutes, new in zip([3, 2, 1], created, strict=True):
        new.created_at = now - timedelta(minutes=minutes)
    session.flush()

    assert names(session, project) == ["PricingCard", "NavBar", "Hero"]


def test_deleting_a_component(session: Session) -> None:
    project = marketing_site(session)
    card = components.create_component(session, project, "PricingCard")
    components.create_component(session, project, "NavBar")

    components.delete_component(session, project, card)

    assert names(session, project) == ["NavBar"]


def test_every_change_moves_the_projects_edited_at(session: Session) -> None:
    project = marketing_site(session)
    yesterday = datetime.now(UTC) - timedelta(days=1)

    def edited(change: Callable[[], object]) -> bool:
        project.edited_at = yesterday
        session.flush()
        change()
        session.refresh(project)
        return project.edited_at > yesterday

    assert edited(lambda: components.create_component(session, project, "Card"))
    card = components.component(
        session, project, components.components_of(session, project)[0].id
    )
    assert edited(lambda: components.rename(session, project, card, "PricingCard"))
    assert edited(lambda: components.duplicate(session, project, card))
    assert edited(lambda: components.save(session, project, card.id, 1, GRAPH, SIZES))
    assert edited(lambda: components.delete_component(session, project, card))


@contextmanager
def committed_component(engine: Engine) -> Iterator[tuple[UUID, UUID]]:
    """A component at version 1 that other connections see. Deleted afterwards."""
    suffix = uuid4().hex[:8]
    with Session(engine) as setup:
        mira = auth.create_account(setup, "Mira", f"mira-{suffix}@acme.dev", PASSWORD)
        team = teams.create_team(setup, mira, "Race", f"race-{suffix}")
        project = projects.create_project(setup, team, mira, "Marketing site", "")
        card = components.create_component(setup, project, "PricingCard")
        setup.commit()
        team_id, mira_id, project_id, card_id = team.id, mira.id, project.id, card.id
    try:
        yield project_id, card_id
    finally:
        with Session(engine) as cleanup:
            # The team first, since an account in a team can't be deleted
            cleanup.execute(delete(Team).where(Team.id == team_id))
            cleanup.execute(delete(Account).where(Account.id == mira_id))
            cleanup.commit()


def test_two_saves_from_the_same_version_at_once_cannot_both_succeed(
    engine: Engine,
) -> None:
    with committed_component(engine) as (project_id, card_id):
        outcome: list[str] = []

        def second_saves() -> None:
            with Session(engine) as second:
                project = second.get_one(Project, project_id)
                try:
                    components.save(
                        second, project, card_id, 1, {"by": "second"}, SIZES
                    )
                    second.commit()
                    outcome.append("saved")
                except components.VersionConflict:
                    outcome.append("conflict")

        with Session(engine) as first:
            project = first.get_one(Project, project_id)
            components.save(first, project, card_id, 1, {"by": "first"}, SIZES)
            thread = threading.Thread(target=second_saves)
            thread.start()
            thread.join(timeout=0.5)
            # Waits for the first save, which has the component's row locked
            assert thread.is_alive()
            first.commit()
        thread.join(timeout=5)

        assert outcome == ["conflict"]
        with Session(engine) as check:
            card = check.get_one(Component, card_id)
            assert (card.graph, card.version) == ({"by": "first"}, 2)

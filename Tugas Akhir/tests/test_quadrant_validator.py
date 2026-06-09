import pytest
from validators.quadrant_validator import (
    detect_graph_evidence,
    determine_quadrant,
)


def test_Q1_high_prob_with_graph_evidence():
    rag = (
        "Mutasi c.1782C>G memengaruhi gen aftB. "
        "Gen aftB berhubungan dengan resistensi terhadap ethambutol."
    )
    assert detect_graph_evidence("c.1782C>G", "aftB", "ethambutol", rag)
    assert determine_quadrant(0.81, True) == "Q1"


def test_Q2_high_prob_no_graph_evidence():
    rag = "Gen katG berhubungan dengan resistensi terhadap isoniazid."
    assert not detect_graph_evidence("S315T", "katG", "INH", rag)
    assert determine_quadrant(0.81, False) == "Q2"


def test_Q3_low_prob_with_graph_evidence():
    rag = (
        "Mutasi c.1782C>G memengaruhi gen aftB. "
        "Gen aftB berhubungan dengan resistensi terhadap ethambutol."
    )
    assert detect_graph_evidence("c.1782C>G", "aftB", "ethambutol", rag)
    assert determine_quadrant(0.0003, True) == "Q3"


def test_Q4_low_prob_no_graph_evidence():
    rag = "Gen embB berhubungan dengan resistensi terhadap ethambutol."
    assert not detect_graph_evidence("S315T", "katG", "INH", rag)
    assert determine_quadrant(0.01, False) == "Q4"

"""Hand-reviewed source locators; crop coordinates use a 1568 × 1109 view."""

from dataclasses import dataclass
from typing import TypedDict

ROOT = (
    "https://www.lta.gov.sg/content/dam/ltagov/industry_innovations/"
    "industry_matters/development_construction_resources/Street_Work_Proposals/"
    "Standards_and_Specifications/SDRE/"
)


class RequiredSource(TypedDict):
    id: str
    filename: str
    publisher: str
    url: str
    sha256: str
    collection_revision: str | None
    page_count: int


class Source(RequiredSource, total=False):
    edition: str


SOURCES: list[Source] = [
    {
        "id": "sup",
        "filename": "sup.pdf",
        "publisher": "LTA",
        "url": ROOT + "SDRE14-10_SUP_1-15_March_2026.pdf",
        "sha256": "515db158a9c9f3f744aae8a54a05f8fbc0f97a3f08959dcdd5117f8ce745fda6",
        "collection_revision": "I",
        "page_count": 17,
    },
    {
        "id": "bus",
        "filename": "bus.pdf",
        "publisher": "LTA",
        "url": ROOT + "SDRE14-11_BUS_1-5_March_2026.pdf",
        "sha256": "fa22937c09e0d974466cc4372d9542862d5494e06e1abee065f74100e7076029",
        "collection_revision": "I",
        "page_count": 10,
    },
    {
        "id": "contents",
        "filename": "contents.pdf",
        "publisher": "LTA",
        "url": ROOT + "Content_Page_March_2026.pdf",
        "sha256": "90ceee831a33fd99bdf00cc2f6d20603382fc69e10d1ea1ea3a82db4c9b6ea42",
        "collection_revision": "I",
        "page_count": 7,
    },
    {
        "id": "tp",
        "filename": "tp.pdf",
        "publisher": "Singapore Police Force",
        "url": "https://www.police.gov.sg/-/media/SPF/Advisories/TP/BT-ENG-2126.pdf",
        "sha256": "4f258856a25b8d0a44e9091f361ce0a07e24138b9a8515620936d088d3c7cefa",
        "collection_revision": None,
        "page_count": 90,
        "edition": "Updated 2 January 2026",
    },
]


@dataclass(frozen=True)
class Sheet:
    source: str
    page: int
    code: str
    revision: str
    title: str
    remainder: str
    warnings: tuple[str, ...] = ()


SHEETS = [
    Sheet(
        "sup",
        3,
        "SUP1",
        "C",
        "Directional and information sign support, sheet 1",
        "Member schedules and design notes remain source evidence, not transcribed geometry.",
    ),
    Sheet(
        "sup",
        4,
        "SUP2",
        "C",
        "Directional and information sign support, sheet 2",
        "Member schedule and small structural sections remain untranscribed.",
    ),
    Sheet(
        "sup",
        5,
        "SUP3",
        "-",
        "Directional and information sign support, sheet 3",
        "Individual details and post-extension splice exported; weld/bolt dimension transcription remains deferred.",
    ),
    Sheet(
        "sup",
        6,
        "SUP4",
        "B",
        "Traffic sign support, sheet 1",
        "Member schedules and material notes remain untranscribed.",
    ),
    Sheet(
        "sup",
        7,
        "SUP5",
        "B",
        "Traffic sign support, sheet 2",
        "Small fastener details remain untranscribed; holder-height comparison retained together.",
    ),
    Sheet(
        "sup",
        8,
        "SUP6",
        "C",
        "Traffic sign support, sheet 3",
        "Post/member schedules and foundation design remain untranscribed.",
    ),
    Sheet(
        "sup",
        9,
        "SUP7",
        "-",
        "Traffic sign support, sheet 4",
        "General fabrication notes remain evidence; no wall-anchor strength inferred.",
    ),
    Sheet(
        "sup",
        10,
        "SUP8",
        "A",
        "Road gantry truss, sheet 1",
        "Footing reinforcement, design schedules and all 3D connections remain untranscribed.",
    ),
    Sheet(
        "sup",
        11,
        "SUP9",
        "A",
        "Road gantry truss, sheet 2",
        "Secondary structural sections and fastener schedules remain untranscribed.",
    ),
    Sheet(
        "sup",
        12,
        "SUP10",
        "-",
        "Road gantry sign",
        "Attachment fabrication notes remain untranscribed.",
    ),
    Sheet(
        "sup",
        13,
        "SUP11",
        "A",
        "Cantilever directional sign support, sheet 1",
        "Footing reinforcement and remaining section geometry remain untranscribed.",
    ),
    Sheet(
        "sup",
        14,
        "SUP12",
        "-",
        "Cantilever directional sign support, sheet 2",
        "Secondary cut sections and fabrication details remain untranscribed.",
    ),
    Sheet(
        "sup",
        15,
        "SUP13",
        "B",
        "Cantilever directional sign support, sheet 3",
        "Design schedules and reinforcement are structural details outside renderer assembly scope.",
    ),
    Sheet(
        "sup",
        16,
        "SUP14",
        "-",
        "Steel brackets for 4.5m height limit sign",
        "Small bracket sections remain untranscribed.",
    ),
    Sheet(
        "sup",
        17,
        "SUP15",
        "A",
        "Traffic sign support for arterial and expressway",
        "Fabrication notes remain untranscribed.",
    ),
    Sheet(
        "bus",
        2,
        "BUS1",
        "F",
        "Bus stop layout",
        "Road layouts, dimensions and bollards are outside mounting-family extraction scope.",
    ),
    Sheet(
        "bus",
        3,
        "BUS2",
        "F",
        "Bus stop section and details",
        "Roof layers, pavement, kerb and drainage details are outside mounting-family scope.",
    ),
    Sheet(
        "bus",
        4,
        "BUS3",
        "C",
        "Catch basin",
        "Drainage-only structural details are not road-control mounting assemblies.",
    ),
    Sheet(
        "bus",
        5,
        "BUS4",
        "D",
        "Bus stop shelter type A — temporary use only",
        "Roofing, bench and footing details remain untranscribed.",
        (
            "Title-block REV is D, but revision-history row E says MAR 2026; retained as printed.",
        ),
    ),
    Sheet(
        "bus",
        6,
        "BUS5",
        "D",
        "Bus stop infrastructure layout and elevation",
        "Shelter module/BIP/seat schedule, colour schedule and general notes remain untranscribed.",
    ),
    Sheet(
        "bus",
        7,
        "BUS6",
        "-",
        "Bus stop shelter structural details, sheet 1",
        "Floor layout and design notes remain structural context.",
    ),
    Sheet(
        "bus",
        8,
        "BUS7",
        "-",
        "Bus stop shelter structural details, sheet 2",
        "Structural member schedule remains untranscribed.",
    ),
    Sheet(
        "bus",
        9,
        "BUS8",
        "-",
        "Bus stop shelter structural details, sheet 3",
        "Roof connections are structural fabrication details outside control-mounting scope.",
    ),
    Sheet(
        "bus",
        10,
        "BUS9",
        "-",
        "Bus stop shelter structural details, sheet 4",
        "Foundation/reinforcement details are structural fabrication details outside control-mounting scope.",
        (
            "BUS6 note 10 references BUS10, but supplied PDF ends at BUS9; no BUS10 source supplied.",
        ),
    ),
]


@dataclass(frozen=True)
class Crop:
    source: str
    page: int
    slug: str
    name: str
    box: tuple[int, int, int, int] | None = None
    image_xref: int | None = None
    warnings: tuple[str, ...] = ()
    excluded_context: tuple[tuple[int, int, int, int], ...] = ()


CROPS = [
    Crop(
        "sup",
        3,
        "directional-single-post",
        "Directional support type A with section A-A",
        (108, 290, 698, 880),
    ),
    Crop(
        "sup",
        3,
        "directional-double-post",
        "Directional support types B, C, D and E",
        (950, 62, 1510, 875),
    ),
    Crop(
        "sup",
        4,
        "directional-rear-frame",
        "Rear view of signboard types B, C, D and E",
        (563, 65, 1118, 855),
    ),
    Crop(
        "sup",
        4,
        "directional-support-type-a",
        "Signboard type A and curved tubular support",
        (109, 85, 496, 450),
    ),
    Crop(
        "sup",
        4,
        "directional-support-section",
        "Signboard types B–E support section A-A",
        (1118, 95, 1485, 860),
    ),
    Crop(
        "sup",
        5,
        "directional-eyelet-detail-1",
        "Isometric eyelet detail 1 for support type A",
        (198, 205, 421, 480),
    ),
    Crop(
        "sup",
        5,
        "directional-bracket-detail-2",
        "Isometric signboard attachment detail 2",
        (520, 53, 783, 480),
    ),
    Crop(
        "sup",
        5,
        "directional-bracket-detail-3",
        "Isometric horizontal-member attachment detail 3",
        (880, 211, 1095, 480),
    ),
    Crop(
        "sup",
        5,
        "directional-bracket-detail-4",
        "Isometric horizontal-member attachment detail 4",
        (185, 532, 452, 853),
    ),
    Crop(
        "sup",
        5,
        "directional-rivet-detail-5",
        "Countersunk rivet detail 5",
        (550, 630, 790, 853),
    ),
    Crop(
        "sup",
        5,
        "directional-bracket-detail-6",
        "Isometric horizontal-member attachment detail 6",
        (839, 550, 1120, 853),
    ),
    Crop(
        "sup",
        5,
        "directional-post-extension",
        "Post-extension splice for support types B–E",
        (1125, 275, 1470, 680),
    ),
    Crop(
        "sup",
        6,
        "low-single-post-support",
        "Low traffic sign single-post support",
        (109, 62, 594, 919),
    ),
    Crop(
        "sup",
        6,
        "low-double-post-support",
        "Low traffic sign double-post support with fixing section",
        (595, 223, 1495, 919),
    ),
    Crop(
        "sup",
        6,
        "low-sign-fixing-section",
        "Low traffic sign fixing section A-A",
        (1208, 445, 1500, 690),
        excluded_context=((1208, 675, 1275, 690),),
    ),
    Crop(
        "sup",
        7,
        "lamp-post-sign-elevation",
        "Traffic sign on lamp post or vertical support",
        (108, 85, 505, 529),
    ),
    Crop(
        "sup",
        7,
        "holder-type-one-height-variants",
        "Holder type 1: 600-and-below, 900 and 1200 panel heights",
        (530, 80, 1495, 919),
        warnings=(
            "Three variants retained together because original dimension callouts share space; isolated parameter geometry deferred.",
        ),
        excluded_context=((530, 635, 680, 890),),
    ),
    Crop(
        "sup",
        7,
        "holder-type-one-isometric",
        "Isometric holder type 1 bracket",
        (230, 590, 705, 919),
        excluded_context=((530, 590, 705, 648),),
    ),
    Crop(
        "sup",
        8,
        "single-post-rear-elevation",
        "Single-post sign rear elevation",
        (590, 55, 1090, 919),
    ),
    Crop(
        "sup",
        8,
        "double-post-rear-elevation",
        "Double-post sign rear elevation, area at most 1.35 square metres",
        (120, 235, 570, 919),
    ),
    Crop(
        "sup",
        8,
        "single-post-fixing-plan",
        "Single-post base-plate plan detail 1",
        (1155, 615, 1425, 919),
    ),
    Crop(
        "sup",
        9,
        "holder-type-two",
        "Offset traffic sign holder type 2",
        (170, 90, 822, 604),
        excluded_context=((710, 432, 822, 604),),
    ),
    Crop(
        "sup",
        9,
        "wall-mounted-sign",
        "Traffic sign on wall",
        (580, 435, 1090, 916),
        excluded_context=((580, 435, 715, 610), (1065, 435, 1090, 510)),
    ),
    Crop(
        "sup", 9, "wall-plate", "Wall plate for holder type 2", (1125, 609, 1410, 887)
    ),
    Crop(
        "sup",
        10,
        "gantry-truss-typical",
        "Typical road gantry truss layout",
        (325, 58, 1310, 515),
        excluded_context=((700, 469, 865, 515),),
    ),
    Crop(
        "sup",
        10,
        "gantry-truss-alternative",
        "Alternative N-truss arrangement",
        (335, 473, 1255, 908),
        excluded_context=((335, 473, 500, 515), (1190, 473, 1255, 515)),
    ),
    Crop(
        "sup",
        11,
        "gantry-truss-splice",
        "Column/top-chord splice detail 2",
        (718, 227, 1070, 492),
    ),
    Crop(
        "sup",
        11,
        "gantry-column-top-connection",
        "Gantry truss end detail 1",
        (178, 122, 673, 488),
    ),
    Crop(
        "sup",
        11,
        "gantry-chain-section",
        "Chain-type section A-A for low overhead structures",
        (1055, 66, 1485, 594),
    ),
    Crop(
        "sup",
        11,
        "gantry-chain-detail",
        "Gantry chain attachment detail 3",
        (1100, 615, 1470, 907),
    ),
    Crop(
        "sup",
        12,
        "gantry-sign-frame-layout",
        "Typical frame layout supporting signboard",
        (551, 589, 1265, 879),
    ),
    Crop(
        "sup",
        12,
        "gantry-sign-frame-detail",
        "Signboard frame detail with section A-A and bolt detail 1",
        (646, 77, 1490, 608),
        excluded_context=((646, 587, 1265, 608),),
    ),
    Crop(
        "sup",
        12,
        "gantry-sign-attachment",
        "Signboard-to-truss connection dimensions",
        (126, 103, 640, 552),
    ),
    Crop(
        "sup",
        12,
        "gantry-sign-bolt-connection",
        "Signboard-to-truss bolt connection detail",
        (164, 630, 494, 908),
    ),
    Crop(
        "sup",
        13,
        "cantilever-sign-elevation",
        "Directional sign elevation along expressway",
        (139, 396, 615, 919),
    ),
    Crop(
        "sup",
        13,
        "cantilever-sign-rear",
        "Rear view of cantilever signboard",
        (107, 53, 871, 391),
        excluded_context=((620, 337, 871, 391),),
    ),
    Crop(
        "sup",
        13,
        "cantilever-sign-attachment",
        "Cantilever sign attachment section A-A",
        (622, 335, 827, 919),
    ),
    Crop(
        "sup",
        14,
        "cantilever-top-member-connection",
        "Top horizontal member connection detail 3 and section A-A",
        (143, 57, 564, 465),
    ),
    Crop(
        "sup",
        14,
        "cantilever-bottom-member-connection",
        "Bottom horizontal member connection detail 4 and section B-B",
        (612, 57, 991, 465),
    ),
    Crop(
        "sup",
        14,
        "cantilever-column-joint",
        "Rotating column joint detail 5",
        (109, 467, 583, 918),
    ),
    Crop(
        "sup",
        14,
        "cantilever-base-plate",
        "Base plate for lower column section",
        (1063, 53, 1465, 469),
    ),
    Crop(
        "sup",
        15,
        "cantilever-foundation-section",
        "Cantilever foundation attachment section A-A",
        (417, 556, 812, 878),
        excluded_context=((770, 850, 812, 878),),
    ),
    Crop(
        "sup",
        16,
        "height-limit-bracket-type-a",
        "Height-limit bracket type A on bridge rail, with detail 1",
        (204, 127, 839, 909),
    ),
    Crop(
        "sup",
        16,
        "height-limit-bracket-type-b",
        "Height-limit bracket type B on wall or beam",
        (865, 114, 1447, 909),
    ),
    Crop(
        "sup",
        16,
        "height-limit-bracket-fixing",
        "Bridge-rail bracket fixing detail 1",
        (203, 680, 460, 899),
    ),
    Crop(
        "sup",
        17,
        "arterial-sign-support",
        "Arterial road support, sign area at most 1.1 square metres",
        (151, 221, 579, 828),
    ),
    Crop(
        "sup",
        17,
        "expressway-sign-support",
        "Expressway support, sign area at most 2.3 square metres",
        (657, 221, 1086, 828),
    ),
    Crop(
        "bus",
        3,
        "bus-bay-shelter-section",
        "Typical section of bus bay and shelter",
        (110, 55, 1040, 465),
    ),
    Crop(
        "bus",
        5,
        "temporary-shelter-front",
        "Temporary type A shelter front elevation",
        (115, 65, 1110, 392),
    ),
    Crop(
        "bus",
        5,
        "temporary-shelter-section",
        "Temporary type A shelter section A-A",
        (1140, 65, 1512, 450),
        excluded_context=((1140, 420, 1180, 450),),
    ),
    Crop(
        "bus",
        6,
        "bus-stop-elevation",
        "Bus stop elevation 1 with sign, pole and information panels",
        (110, 57, 979, 348),
    ),
    Crop(
        "bus",
        6,
        "bus-stop-layout-plan-one",
        "Bus stop layout plan 1 with approach direction",
        (108, 349, 990, 635),
    ),
    Crop(
        "bus",
        6,
        "bus-stop-layout-plan-two",
        "Bus stop layout plan 2 with approach direction",
        (108, 644, 1215, 919),
    ),
    Crop(
        "bus",
        6,
        "bus-stop-pole-example",
        "Bus stop pole from elevation 1",
        (807, 128, 847, 232),
    ),
    Crop(
        "bus",
        7,
        "shelter-structural-elevation",
        "Bus shelter structural elevation",
        (470, 550, 1215, 885),
    ),
    Crop(
        "bus",
        8,
        "shelter-structural-section-a",
        "Bus shelter structural section A-A",
        (120, 90, 755, 580),
    ),
    Crop(
        "bus",
        8,
        "shelter-structural-section-b",
        "Bus shelter structural section B-B",
        (820, 90, 1430, 580),
    ),
    Crop(
        "tp",
        45,
        "signal-circular-red",
        "Vertical circular signal showing red",
        image_xref=355,
    ),
    Crop(
        "tp",
        45,
        "signal-circular-amber",
        "Vertical circular signal showing amber",
        image_xref=356,
    ),
    Crop(
        "tp",
        45,
        "signal-circular-green",
        "Vertical circular signal showing green",
        image_xref=357,
    ),
    Crop(
        "tp",
        45,
        "signal-red-with-right-green",
        "Main red with additional right green arrow",
        image_xref=358,
    ),
    Crop(
        "tp",
        46,
        "signal-green-b-source-example",
        "Main red with green B — handbook arrangement",
        image_xref=361,
        warnings=(
            "Handbook shows B to right of red. Rule 11(e) specifies left of or above red from approach. Do not mirror or adopt as verified legal placement.",
        ),
    ),
    Crop(
        "tp",
        46,
        "signal-advance-warning",
        "Advanced warning lights and prepare-to-stop sign",
        image_xref=362,
    ),
    Crop(
        "tp",
        46,
        "signal-right-arrow-green",
        "Right-arrow signal showing green",
        image_xref=363,
    ),
    Crop(
        "tp",
        46,
        "signal-right-arrow-amber",
        "Right-arrow signal showing amber",
        image_xref=364,
    ),
    Crop(
        "tp",
        46,
        "signal-right-arrow-red",
        "Right-arrow signal showing red",
        image_xref=365,
    ),
    Crop(
        "tp",
        47,
        "signal-through-green-right-green",
        "Circular green with right-arrow green",
        image_xref=368,
    ),
    Crop(
        "tp",
        47,
        "signal-through-green-right-amber",
        "Circular green with right-arrow amber",
        image_xref=369,
    ),
    Crop(
        "tp",
        47,
        "signal-through-green-right-red",
        "Circular green with right-arrow red",
        image_xref=370,
    ),
]

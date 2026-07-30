export type NewsSection = { heading?: string; paragraphs: string[] };
export type NewsGalleryItem = { src: string; alt: string; caption?: string };

export type NewsArticle = {
  slug: string;
  tag: string;
  title: string;
  date: string;
  location?: string;
  readMinutes: number;
  summary: string;
  heroImage?: string;
  heroImageAlt?: string;
  sponsored?: boolean;
  gallery?: NewsGalleryItem[];
  sections: NewsSection[];
};

const photoAsset = (fileName: string) => encodeURI(`/${fileName}`);

export const newsArticles: NewsArticle[] = [
  {
    slug: "song-school-planting-day",
    tag: "Sponsor story",
    title: "A planting day across Song: new trees for three school grounds",
    date: "2026-07-27",
    location: "Song LGA, Adamawa State",
    readMinutes: 6,
    sponsored: true,
    summary:
      "On 27 July, LandCheck Green field teams planted across Song Local Government Area, covering Model School Song, G.R.A. Nursery and Primary School, and Atiku Primary Secondary School.",
    heroImage: photoAsset("song-4-safe.jpg"),
    heroImageAlt: "LandCheck Green field agent positions a protective basket around a newly planted tree while pupils watch in Song, Adamawa State",
    gallery: [
      {
        src: photoAsset("song 1.jpeg"),
        alt: "LandCheck Green field team, teachers, and pupils gathered at a school entrance in Song Local Government Area",
        caption: "Field team, school staff, and pupils gathered after the Song planting round.",
      },
      {
        src: photoAsset("song 2.jpeg"),
        alt: "LandCheck Green field team and community members standing with a seedling and protective basket at a school in Song",
        caption: "School and community representatives reviewed the seedling and protective guard before planting.",
      },
      {
        src: photoAsset("song 3.jpeg"),
        alt: "LandCheck Green team at the Model School Song signboard in Adamawa State",
        caption: "One stop on the route was Model School Song, one of the public education sites now receiving tree cover.",
      },
      {
        src: photoAsset("song-4-safe.jpg"),
        alt: "Children watching as a LandCheck Green field agent lowers a protective basket over a newly planted seedling in Song",
        caption: "Pupils watched the installation of the protective basket around the fresh planting.",
      },
      {
        src: photoAsset("song 5.jpeg"),
        alt: "LandCheck Green field staff checking capture details beside a protective basket at a school in Song",
        caption: "The team checked field details on site so the record would remain traceable after planting day.",
      },
      {
        src: photoAsset("song 6.jpeg"),
        alt: "Close-up of a LandCheck Green field agent securing a protective basket around a planted tree in Song",
        caption: "Each planting was protected immediately to improve early survival on active school grounds.",
      },
    ],
    sections: [
      {
        paragraphs: [
          "On Sunday, 27 July 2026, LandCheck Green field teams completed a coordinated school planting round across Song Local Government Area in Adamawa State. The day's work covered Model School Song, G.R.A. Nursery and Primary School, and Atiku Primary Secondary School in Song, with seedlings planted, protected, and recorded as part of the programme's live field evidence workflow.",
          "This was not a ceremonial visit with photos only. It was a full implementation day: field agents moved with seedlings, protective baskets, school-side coordination, and on-site capture steps so that every planted tree could feed back into the LandCheck record trail.",
        ],
      },
      {
        heading: "Why Song matters",
        paragraphs: [
          "Song is one of Adamawa State's major local government areas, with Song Town serving as its administrative headquarters. Public datasets and state references place it among the larger LGAs in the state, with communities that depend heavily on public institutions such as schools for daily civic life.",
          "That makes school compounds in Song the right kind of place for visible planting work. Trees planted there are not hidden inside private estates. They sit where pupils, teachers, guardians, and surrounding residents can see the value of shade, care, and environmental stewardship in everyday use.",
        ],
      },
      {
        heading: "Model-school investment meets live environmental evidence",
        paragraphs: [
          "Adamawa State's current model-school push has expanded attention to public education infrastructure across the state, with the government publicly framing the programme around one model basic education school for each local government area. The Federal Ministry of Education's Adamawa school listing also includes Model N/P School Song among the schools recorded for Song.",
          "For LandCheck Green, that creates a practical opportunity: where public education infrastructure is being improved, tree cover should not remain an afterthought. The Song planting round connected that logic directly to the ground by adding trees to learning environments that children already use every day.",
        ],
      },
      {
        heading: "What today's record shows",
        paragraphs: [
          "The six Song field photos now added to LandCheck's public story layer show exactly what implementation should look like: staff presence, community presence, pupils witnessing the work, seedling protection, and field capture happening at the point of planting rather than afterward from memory.",
          "That is the difference between a vague claim that trees were planted somewhere and a structured operational record that can support reporting, donor communication, and future follow-up visits. The work in Song is small in scale compared with a state-wide programme, but it demonstrates the discipline the platform is built to keep repeating.",
        ],
      },
    ],
  },
  {
    slug: "fufore-model-school-first-trees",
    tag: "Sponsor story",
    title: "The first trees on a brand-new campus in Fufore",
    date: "2026-07-23",
    location: "Fufore LGA, Adamawa State",
    readMinutes: 5,
    sponsored: true,
    summary:
      "A brand-new school campus built on cleared ground had never had a single tree on it — until a public sponsor changed that on 23 July.",
    heroImage: photoAsset("fufore.JPG"),
    heroImageAlt: "LandCheck Green field agents and a community elder in front of the New Model School construction signboard in Fufore",
    sections: [
      {
        paragraphs: [
          "In 2024, Adamawa State Governor Ahmadu Umaru Fintiri's administration broke ground on twenty-one new \"Model Basic Schools\" — one for every local government area in the state — inaugurated at a flag-off ceremony in Girei as part of a wider infrastructure and education programme. It is one of the signature projects of his administration: new classroom blocks, new furniture, and, more recently, new security fencing and gatehouses funded to protect the investment.",
          "One of those twenty-one campuses rose out of bare, cleared ground in Fufore. Government Secondary School, Fufore — the \"New Model School\" — got new buildings, new walls, and a new name. What it did not get, because no construction project ever does, was a single tree.",
        ],
      },
      {
        heading: "A campus with zero canopy",
        paragraphs: [
          "New school construction anywhere in the world tends to follow the same pattern: clear the land, lay the foundation, put up the walls, then move on to the next site. Landscaping and shade are almost always an afterthought, if they happen at all. For students in Fufore, that meant a modern campus with no shade to sit under between classes and no tree line to soften the heat radiating off the new concrete.",
          "That is the gap a LandCheck Green public sponsor closed on 23 July, when the very first seedlings went into the ground on the school's grounds — not a top-up to an existing tree line, but the first afforestation effort the campus had ever seen since construction began.",
        ],
      },
      {
        heading: "A founding forest, not an afterthought",
        paragraphs: [
          "It is a small detail with an outsized meaning: the students who study at this Model School for the next several decades will do so under trees that can be traced back to one sponsor, one planting day, and one decision not to wait for someone else to do it first.",
          "That is the model LandCheck Green is built around — an individual, anywhere, sponsors a real tree at a real coordinate, a field agent plants and geotags it, and the sponsor can follow its growth from a phone. In Fufore, that model happened to write the opening page of a school's environmental story.",
        ],
      },
    ],
  },
  {
    slug: "yola-south-health-center-trees",
    tag: "Sponsor story",
    title: "Trees at the clinic door: greening a Yola South health center",
    date: "2026-07-23",
    location: "Yola South LGA, Adamawa State",
    readMinutes: 5,
    sponsored: true,
    summary:
      "Minutes from one of Adamawa's largest hospitals sit community health centers with a fraction of the resources — and, until 23 July, no shade for the patients who queue outside them.",
    heroImage: photoAsset("yola south plantin3.JPG"),
    heroImageAlt: "LandCheck Green field agents with staff outside Jabbi Primary Health Care Authority, Yola South",
    sections: [
      {
        paragraphs: [
          "Yola South carries more history in its name than most local government areas in Nigeria. It sits on ground first settled in 1841, when Modibbo Adama — the Fulani leader whose name Adamawa State itself carries — founded what became the seat of the old Fombina Emirate. Nearly two centuries later, Yola South is home to some of the region's most important institutions, including the Federal Medical Centre, Yola, one of the largest referral hospitals in the state.",
          "But drive a short distance off the main road, away from the federal hospital, and the picture changes. Community health centers like Jabbi Primary Health Care Authority see a steady stream of patients — mothers with newborns, people queuing for routine care — with a fraction of the staff, equipment, and infrastructure of the bigger facility a few kilometres away.",
        ],
      },
      {
        heading: "No shade, no shelter",
        paragraphs: [
          "One of the smallest and most overlooked gaps at facilities like this is simple: shade. Patients often wait outside, in the open, under the same Adamawa sun that pushes temperatures past 33°C for most of the year. A tree is not a substitute for staffing or equipment, but it is one of the cheapest, longest-lasting interventions available — and one almost nobody budgets for.",
          "On 23 July, that changed at Jabbi Primary Health Care Authority. A tree funded entirely by a public LandCheck Green sponsor — an individual, not a government programme or an NGO grant — was planted directly on the health center's grounds, with facility staff and the local community looking on.",
        ],
      },
      {
        heading: "Why a tree at a clinic matters",
        paragraphs: [
          "The link between environment and public health is easy to state and easy to ignore: trees cool the air around them, cut down on dust, and give people somewhere to sit that isn't direct sun. For a health center already stretched thin, a mature shade tree in a few years is a small piece of infrastructure the community will not have to ask the government to fund.",
          "It is also, like every tree on LandCheck Green, one specific seedling with a GPS coordinate, a planting date, and a sponsor who can watch it grow — proof that a single online donation can land somewhere as concrete as a clinic courtyard in Yola South.",
        ],
      },
    ],
  },
  {
    slug: "sangere-girei-university-village-trees",
    tag: "Sponsor story",
    title: "The village that became a university town: trees for Sangere, Girei",
    date: "2025-07-15",
    location: "Sangere, Girei LGA, Adamawa State",
    readMinutes: 6,
    sponsored: true,
    summary:
      "A quiet farming settlement ten kilometres outside Yola turned into one of Adamawa's busiest educational corridors — and on 15 July, a public sponsor helped it grow a little greener again.",
    heroImage: photoAsset("sangere girei 1.JPG"),
    heroImageAlt: "Community members and a LandCheck Green field agent plant a tree in Sangere, Girei LGA",
    sections: [
      {
        paragraphs: [
          "Girei is one of the twenty-one local government areas of Adamawa State, sitting on the Benue River in the state's central belt, where farming and livestock have supported Fulɓe and Bwatiye communities for generations. For most of its history it was a quiet, agricultural corner of the state — the kind of place travellers passed through on the road out of Yola rather than a destination in itself.",
          "That changed with a university. Sangere, a village inside Girei LGA roughly ten kilometres from Jimeta, became the permanent site of what was then the Federal University of Technology, Yola — FUTY — later renamed Modibbo Adama University in honour of the same nineteenth-century Fulani leader whose name Adamawa State itself carries. The institution briefly merged with the University of Maiduguri in 1984 before regaining its independence in 1988, and has since grown into one of the state's principal centres of higher education.",
        ],
      },
      {
        heading: "A village that never stopped being a village",
        paragraphs: [
          "Today, Sangere carries two identities at once. It is still a farming settlement, and it is also a university town that draws students from across northern Nigeria every academic session — a level of daily foot traffic, construction, and settlement growth that a village built for a few hundred farming families was never laid out to absorb.",
          "That growth has a quiet cost: tree cover thins out first along the roads, compounds, and open ground closest to where people actually live and move, precisely because that is where demand for building space is highest. It is an ordinary story repeated around fast-growing campuses everywhere, and Sangere is no exception.",
        ],
      },
      {
        heading: "One sponsor, one tree, one small correction",
        paragraphs: [
          "On 15 July, that trend ran briefly in reverse. A LandCheck Green public sponsor — someone who never has to set foot in Adamawa State to do it — funded a tree planted directly in the Sangere community, geotagged and photographed by a local field agent the same day it went into the ground.",
          "It will not reforest Girei on its own. But it is a small, verifiable example of a broader idea LandCheck Green is built on: that the communities absorbing the fastest growth in Nigeria — university towns, new school campuses, health centers stretched thin — are exactly the places that benefit most from someone, anywhere, deciding to fund one more tree.",
        ],
      },
    ],
  },
  {
    slug: "ecf-partnership",
    tag: "Case study",
    title: "LandCheck signs strategic partnership MoU with Environmental Care Foundation",
    date: "2026-05-15",
    readMinutes: 4,
    summary:
      "A partnership story that helps position LandCheck as a serious implementation and reporting partner for environmental programmes in Nigeria.",
    heroImage: "/ecf-partnership.jpeg",
    heroImageAlt: "LandCheck and ECF representatives at partnership event, Adamawa State",
    sections: [
      {
        paragraphs: [
          "LandCheck Geospatial Technologies Limited entered into a formal Memorandum of Understanding with the Environmental Care Foundation, an Adamawa State-based organisation working across environmental action, climate adaptation, and community development.",
          "For sales and partnership conversations, this is more than a news update. It is proof that real organisations are already willing to collaborate with LandCheck around field execution, programme visibility, and stakeholder reporting.",
        ],
      },
      {
        heading: "Why the story matters",
        paragraphs: [
          "Case studies reduce procurement anxiety. A CSR manager, NGO lead, or donor representative needs to know whether your product is already trusted by actors who understand field delivery in Nigeria.",
          "Even an early pilot partnership can show that the product is not just a concept. It signals relevance, implementation fit, and local credibility.",
        ],
      },
    ],
  },
  {
    slug: "corporate-tree-projects",
    tag: "Guide",
    title: "How to manage corporate tree-planting projects without losing control",
    date: "2026-07-21",
    readMinutes: 4,
    summary:
      "A practical structure for turning a CSR tree-planting idea into a verified programme with clear roles, evidence, and reporting.",
    sections: [
      {
        paragraphs: [
          "Corporate tree-planting projects often fail when organisations focus only on the planting day. The real work starts earlier with project design and continues long after the initial field activity.",
          "A strong programme should define approved locations, species strategy, land rights, field-agent structure, maintenance plan, review flow, and reporting cadence before implementation begins.",
        ],
      },
      {
        heading: "What the implementation stack should include",
        paragraphs: [
          "First, create a mapped project structure so every planting site, assignment, and field record belongs to a controlled programme. Second, assign field staff through named work orders instead of informal instructions. Third, enforce photo and GPS evidence so every completed step is reviewable.",
          "Finally, build a reporting layer that allows managers to see survival, maintenance, evidence coverage, and operational backlog without waiting for manual spreadsheet aggregation.",
        ],
      },
    ],
  },
  {
    slug: "csr-reporting-checklist",
    tag: "Checklist",
    title: "CSR reporting checklist for field implementation programmes",
    date: "2026-07-21",
    readMinutes: 3,
    summary:
      "The minimum information a CSR manager should expect before presenting a tree-planting programme internally or externally.",
    sections: [
      {
        paragraphs: [
          "A credible CSR report should answer simple but demanding questions: What was promised, where did it happen, who implemented it, how was it verified, what remains unresolved, and what proof can be shown to stakeholders?",
          "That means the reporting pack should include project scope, mapped locations, implementation status, evidence capture rate, species or activity breakdown, field-risk notes, maintenance progress, and clear exportable summaries.",
        ],
      },
      {
        heading: "What to check before sharing the report",
        paragraphs: [
          "Confirm that project locations are approved and mapped, planting or activity records are tied to supervisors or agents, and evidence photos are attached to the right field events. Review whether there is a clear distinction between completed work, pending work, and rejected submissions.",
          "The goal is not only to look professional. The goal is to make reporting defensible when a board member, donor, partner, or journalist asks for proof.",
        ],
      },
    ],
  },
  {
    slug: "gps-verification",
    tag: "Verification",
    title: "GPS verification for environmental projects: why proof matters",
    date: "2026-07-21",
    readMinutes: 3,
    summary:
      "Coordinates, timestamped photos, and supervisor review are what separate credible field reporting from unverifiable claims.",
    sections: [
      {
        paragraphs: [
          "Environmental projects are difficult to trust when the only evidence is a narrative summary or a folder of disconnected photos. GPS verification changes that by tying each field record to an actual place and workflow event.",
          "When field records are linked to coordinates, polygons, timestamps, images, and reviewer status, organisations can trace the path from assignment to execution to reporting more confidently.",
        ],
      },
      {
        heading: "Why this improves trust",
        paragraphs: [
          "Verification is not just about maps. It is about operational accountability. A manager should be able to see who was assigned, what was captured, whether the evidence was approved, and what still needs follow-up.",
          "For CSR, donor, and public-facing programmes, this is the difference between activity claims and implementation proof.",
        ],
      },
    ],
  },
  {
    slug: "environmental-monitoring",
    tag: "Operations",
    title: "Environmental project monitoring made easier with live implementation data",
    date: "2026-07-21",
    readMinutes: 3,
    summary:
      "Why organisations should move from ad hoc spreadsheets to live implementation oversight for environmental projects.",
    sections: [
      {
        paragraphs: [
          "Environmental programmes become harder to manage as soon as teams scale beyond a single location or supervisor. Separate spreadsheets for assignments, evidence, maintenance, and reporting usually lead to blind spots.",
          "A live monitoring system lets managers see current activity, outstanding maintenance, evidence gaps, rejected submissions, mapped project areas, and staff workload in one place.",
        ],
      },
      {
        heading: "What changes in practice",
        paragraphs: [
          "Instead of waiting for monthly consolidation, managers can track progress as the field work happens. That makes it easier to intervene when delivery slips, proof is incomplete, or the programme is drifting away from stated objectives.",
          "Monitoring becomes more useful when it is operational, not only historical.",
        ],
      },
    ],
  },
  {
    slug: "esg-reporting-easier",
    tag: "ESG",
    title: "ESG reporting made easier when field evidence is structured from day one",
    date: "2026-07-21",
    readMinutes: 3,
    summary:
      "How live implementation records can support cleaner sustainability and ESG reporting workflows.",
    sections: [
      {
        paragraphs: [
          "Many ESG reporting teams struggle because implementation evidence was never captured in a structured way. By the time reporting season arrives, teams are trying to rebuild the programme story from scattered notes and images.",
          "A stronger approach is to structure the operational record from the first assignment. That includes mapped project units, named assignees, verified submissions, maintenance history, and exportable summaries.",
        ],
      },
      {
        heading: "Why this matters for corporate teams",
        paragraphs: [
          "Not every organisation has in-house environmental implementation staff. When the execution system is already producing traceable field records, reporting teams can reuse the data with less friction and less risk.",
          "That does not replace sustainability judgement. It improves the quality of the operational evidence that feeds it.",
        ],
      },
    ],
  },
];

export function getArticleBySlug(slug: string | undefined): NewsArticle | undefined {
  return newsArticles.find((article) => article.slug === slug);
}

export const featuredSponsorStory = newsArticles.find((article) => article.slug === "song-school-planting-day")!;

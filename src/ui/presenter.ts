/**
 * Replaceable presentation seam for one derived commitment graph.
 */

import type { GraphResult } from "../graph/commitment-graph";
import type { PresentationSettings } from "../settings/settings";


/** Presents a graph without retrieving, building, or persisting it. */
export interface GraphPresenter {
    /** Display one built graph and its nonblocking findings. */
    show(result: GraphResult, presentation: PresentationSettings): void;
}

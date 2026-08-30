import type { ObjectId } from "mongodb"
import type { ReconcileReport } from "@/lib/gallery/reconcile"

export { }

declare global {

    /**
     * The last reconcile report.
     *
     * Exactly one document, overwritten each run. The Health view renders this
     * rather than re-walking 4,781 files on every page load, and a reconcile
     * that runs after a backup restore leaves its result here for whoever
     * looks next.
     *
     * The fields are ReconcileReport's, inherited rather than restated: the
     * view reads this document expecting exactly what reconcile() returned,
     * and two hand-maintained copies of the same nine fields would eventually
     * disagree about one of them.
     */
    interface GalleryHealth extends ReconcileReport {
        _id: ObjectId
    }

}

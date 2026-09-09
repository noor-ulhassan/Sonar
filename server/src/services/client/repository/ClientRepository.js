import BaseClientRepository from "./BaseClientRepository.js";
import Client from "../../../shared/models/Client.js";
import logger from "../../../shared/config/logger.js";
class MongoClientRepository extends BaseClientRepository {
  constructor() {
    super(Client);
  }

  async create(clientData) {
    try {
      const client = new this.model(clientData);
      await client.save();
      logger.debug("Client Created in Mongodb", {
        mongoId: client._id,
        slug: client.slug,
      });
      return client;
    } catch (error) {}
  }
}

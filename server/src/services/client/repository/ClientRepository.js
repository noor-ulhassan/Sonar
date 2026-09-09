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
      logger.info("Client Created in Mongodb", {
        mongoId: client._id,
        slug: client.slug,
      });
      return client;
    } catch (error) {
      logger.error("Error creating client in mongodb", error);
      throw error;
    }
  }

  async findById(clientId) {
    try {
      const client = await this.model.findById(clientId);
      logger.info("Client details from mongodb", client);
      return client;
    } catch (error) {
      logger.error("Error finding client in db by Id", error);
      throw error;
    }
  }
}
